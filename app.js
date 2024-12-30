import 'dotenv/config';
import express from 'express';
import {
  InteractionType,
  InteractionResponseType,
  InteractionResponseFlags,
  MessageComponentTypes,
  ButtonStyleTypes,
  verifyKeyMiddleware,
} from 'discord-interactions';
import { Client, GatewayIntentBits, EmbedBuilder, SnowflakeUtil, PermissionFlagsBits } from 'discord.js';
import { getRandomEmoji, DiscordRequest, capitalize } from './utils.js';
import { getShuffledOptions, getResult } from './game.js';
import { 
  loadPlayerData, 
  updatePlayer, 
  getPlayer, 
  saveAllPlayerData,
  loadTribeIds,
  savePlayerData 
} from './storage.js';
import fs from 'fs';

// Create an express app
const app = express();
// Get port, or default to 3000
const PORT = process.env.PORT || 3000;

// Initialize Discord client
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

client.once('ready', () => {
  console.log('Discord client is ready!');
});

// Store for in-progress games. In production, you'd want to use a DB
const activeGames = {};

// Fix timezone offset mappings - the role IDs were swapped
const timezoneOffsets = {
  '1320094346288300124': -5,  // EST (UTC-5)
  '1320094564731850803': -6,  // CST (UTC-6)  // Fixed role ID
  '1320094467486908507': -8,  // PST (UTC-8)  // Fixed role ID
  '1320094634646704350': -3,  // ADT (UTC-3)
};

// Load pronoun role IDs from JSON file
const pronounsConfig = JSON.parse(fs.readFileSync('./pronouns.json'));
const pronounRoleIDs = pronounsConfig.pronounRoleIDs;

// Define role IDs first
const timezoneRoleIds = [
  '1320094346288300124',
  '1320094467486908507',
  '1320094564731850803',
  '1320094634646704350',
];

// Now create roleConfig after IDs are defined
const roleConfig = { 
  timezoneRoleIds,
  timezoneOffsets,
  pronounRoleIDs
};

// Add this near the top with other constants
const REQUIRED_PERMISSIONS = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageRoles,
];

// Add this helper function
async function hasRequiredPermissions(guildId, userId) {
  const guild = await client.guilds.fetch(guildId);
  const member = await guild.members.fetch(userId);
  return REQUIRED_PERMISSIONS.some(perm => member.permissions.has(perm));
}

/**
 * Interactions endpoint URL where Discord will send HTTP requests
 * Parse request body and verifies incoming requests using discord-interactions package
 */
app.post('/interactions', verifyKeyMiddleware(process.env.PUBLIC_KEY), async function (req, res) {
  // Interaction type and data
  const { type, id, data, guild_id } = req.body;

  /**
   * Handle verification requests
   */
  if (type === InteractionType.PING) {
    return res.send({ type: InteractionResponseType.PONG });
  }

  /**
   * Handle slash command requests
   * See https://discord.com/developers/docs/interactions/application-commands#slash-commands
   */
  if (type === InteractionType.APPLICATION_COMMAND) {
    const rawName = data.name;
    // Strip "dev_" if present
    const name = rawName.replace(/^dev_/, '');

    console.log(`Received command: ${rawName}`);

    // Skip permission check for castlist
    if (name !== 'castlist') {
      const hasPerms = await hasRequiredPermissions(req.body.guild_id, req.body.member.user.id);
      if (!hasPerms) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'You do not have permission to use this command.',
            flags: InteractionResponseFlags.EPHEMERAL,
          },
        });
      }
    }

    if (name === 'castlist') {
      try {
        console.log('Processing castlist command');
        const guildId = req.body.guild_id;

        // Load tribe IDs from JSON file
        const rawData = fs.readFileSync('./tribes.json');
        const tribesCfg = JSON.parse(rawData);
        const tribeIDs = {
          tribe1: tribesCfg.tribe1,
          tribe2: tribesCfg.tribe2,
          tribe3: tribesCfg.tribe3,
          tribe4: tribesCfg.tribe4,
        };
        console.log('Loaded tribe IDs:', tribeIDs);

        // Define the createMemberFields function first
        const createMemberFields = async (members, guild) => {
          const fields = [];
          
          // Convert members to array for sorting
          const membersArray = Array.from(members.values());
          // Sort members by displayName
          membersArray.sort((a, b) => a.displayName.localeCompare(b.displayName));
          
          for (const member of membersArray) {
            try {
              let pronouns = pronounRoleIDs
                .filter(pronounRoleID => member.roles.cache.has(pronounRoleID))
                .map(pronounRoleID => {
                  const role = guild.roles.cache.get(pronounRoleID);
                  return role ? role.name : '';
                })
                .filter(name => name !== '')
                .join(', ');

              // Add friendly message if no pronoun roles
              if (!pronouns) {
                pronouns = 'No pronoun roles';
              }

              let timezone = timezoneRoleIds
                .filter(timezoneRoleId => member.roles.cache.has(timezoneRoleId))
                .map(timezoneRoleId => {
                  const role = guild.roles.cache.get(timezoneRoleId);
                  return role ? role.name : '';
                })
                .filter(name => name !== '')
                .join(', ');

              // Add friendly message if no timezone roles
              if (!timezone) {
                timezone = 'No timezone roles';
              }

              const utcTime = Math.floor(Date.now() / 1000); // Current UTC timestamp
              let memberTime = utcTime;

              timezoneRoleIds.forEach(timezoneRoleId => {
                if (member.roles.cache.has(timezoneRoleId)) {
                  const offset = timezoneOffsets[timezoneRoleId];
                  memberTime = utcTime + (offset * 3600);
                  console.log({
                    member: member.displayName,
                    roleId: timezoneRoleId,
                    timezone: guild.roles.cache.get(timezoneRoleId)?.name,
                    offset,
                    utcTime: new Date(utcTime * 1000).toUTCString(),
                    memberTime: new Date(memberTime * 1000).toUTCString()
                  });
                }
              });

              const date = new Date(memberTime * 1000);
              const hours = date.getUTCHours() % 12 || 12;
              const minutes = date.getUTCMinutes().toString().padStart(2, '0');
              const ampm = date.getUTCHours() >= 12 ? 'PM' : 'AM';
              const formattedTime = `\`🕐 ${hours}:${minutes} ${ampm} 🕐\``;

              // Get player data from storage
              const playerData = await getPlayer(member.id);
              const age = playerData?.age ? `${playerData.age}` : 'No age set';
              
              // Create name field with emoji if it exists
              const nameWithEmoji = playerData?.emojiCode ? 
                `${playerData.emojiCode} ${capitalize(member.displayName)}` : 
                capitalize(member.displayName);

              let value = `> * ${age}\n> * ${pronouns}\n> * ${timezone}\n> * ${formattedTime}`;
              fields.push({
                name: nameWithEmoji,
                value: value,
                inline: true
              });
            } catch (err) {
              console.error(`Error processing member ${member.displayName}:`, err);
            }
          }
          return fields;
        };

        // Send initial response
        res.send({
          type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
        });

        const guild = await client.guilds.fetch(guildId);
        console.log('Guild:', guild); // Debug log

        if (!guild) {
          throw new Error('Could not fetch guild');
        }

        // Fetch the full guild with roles cache
        const fullGuild = await client.guilds.fetch(guildId, { force: true });
        await fullGuild.roles.fetch();
        const members = await fullGuild.members.fetch();

        // Save all player data to JSON
        const allMembers = Array.from(members.values());
        const savedData = await saveAllPlayerData(allMembers, fullGuild, roleConfig);
        console.log('Saved all player data to JSON:', savedData);

        // Create arrays to store tribe data
        const tribeRoles = [];
        const tribeMembers = [];

        // Fetch roles and members for each tribe
        for (const [key, tribeId] of Object.entries(tribeIDs)) {
          if (tribeId) {  // Only process tribes that have IDs
            const tribeRole = fullGuild.roles.cache.get(tribeId);
            if (tribeRole) {
              console.log(`Processing tribe ${key} with ID ${tribeId}:`);
              console.log(`- Role name: ${tribeRole.name}`);
              const tribeMemberCollection = members.filter(member => member.roles.cache.has(tribeId));
              
              // Debug member filtering
              const memberArray = Array.from(tribeMemberCollection.values());
              console.log(`- Member count: ${memberArray.length}`);
              console.log(`- Members: ${memberArray.map(m => `${m.displayName} (${m.id})`).join(', ')}`);
              console.log(`- Raw member roles: ${memberArray.map(m => Array.from(m.roles.cache.keys())).join(', ')}`);
              
              tribeRoles.push(tribeRole);
              tribeMembers.push(tribeMemberCollection);
            } else {
              console.log(`Could not find role for tribe ${key} with ID ${tribeId}`);
            }
          }
        }

        // Create the embed
        const embed = new EmbedBuilder()
          .setTitle('Dynamic Castlist')
          .setAuthor({ 
            name: fullGuild.name || 'Unknown Server', 
            iconURL: fullGuild.iconURL() || undefined 
          })
          .setColor('#7ED321');

        // Add each tribe that has members
        for (let i = 0; i < tribeRoles.length; i++) {
          console.log(`Adding tribe ${i + 1} to embed: ${tribeRoles[i].name}`);
          // Add spacer if this isn't the first tribe
          if (i > 0) {
            embed.addFields({ name: '\u200B', value: '\u200B', inline: false });
          }
          
          // Add tribe header and members
          const tribeEmoji = tribesCfg[`tribe${i + 1}emoji`] || '';
          const header = tribeEmoji
            ? `${tribeEmoji}  ${tribeRoles[i].name}  ${tribeEmoji}`
            : tribeRoles[i].name;
          embed.addFields({ name: header, value: '\u200B', inline: false });
          const memberFields = await createMemberFields(tribeMembers[i], fullGuild);
          console.log(`Generated ${memberFields.length} member fields for tribe ${i + 1}`);
          embed.addFields(memberFields);
        }

        // Edit the initial response with the embed
        const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
        await DiscordRequest(endpoint, {
          method: 'PATCH',
          body: {
            embeds: [embed],
          },
        });
      } catch (error) {
        console.error('Error handling castlist command:', error);
      }
      return;
    } else if (name === 'zzgetallguildroles') {
      try {
        console.log('Processing getAllGuildRoles command');
        const guildId = req.body.guild_id;

        // Send initial response
        res.send({
          type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
        });

        const guild = await client.guilds.fetch(guildId);
        const roles = guild.roles.cache.map(role => role.id).join(', ');

        console.log('Fetched roles:', roles);

        // Truncate roles if it exceeds the maximum length
        let content = `Role IDs: ${roles}`;
        if (content.length > 2000) {
          content = content.substring(0, 1997) + '...';
        }

        // Edit the initial response with the role IDs
        const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
        await DiscordRequest(endpoint, {
          method: 'PATCH',
          body: {
            content: content,
          },
        });
      } catch (error) {
        console.error('Error handling getAllGuildRoles command:', error);
      }
      return;
    } else if (name === 'util_setage') {
      try {
        const userId = data.options[0].value;
        const age = data.options[1].value;
        
        await updatePlayer(userId, { age });

        // After updating, trigger a refresh of the data
        const guildId = req.body.guild_id;
        const guild = await client.guilds.fetch(guildId);
        const member = await guild.members.fetch(userId);
        
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `Age updated to ${age} for ${member.displayName}`,
            flags: InteractionResponseFlags.EPHEMERAL,
          },
        });
      } catch (error) {
        console.error('Error setting age:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'Error updating age. Make sure the user ID is valid.',
            flags: InteractionResponseFlags.EPHEMERAL,
          },
        });
      }
    } else if (name === 'util_checkdata') {
      try {
        console.log('Starting checkdata command...');
        
        await res.send({
          type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
        });

        const playerData = await loadPlayerData();
        const stringified = JSON.stringify(playerData, null, 2);
        
        // Take only first 1800 characters (leaving room for code block syntax)
        const truncated = stringified.length > 1800 
          ? stringified.substring(0, 1800) + '\n... (truncated)' 
          : stringified;
        
        const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
        await DiscordRequest(endpoint, {
          method: 'PATCH',
          body: {
            content: `\`\`\`json\n${truncated}\n\`\`\``,
          },
        });

      } catch (error) {
        console.error('Error in checkdata command:', error);
        const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
        await DiscordRequest(endpoint, {
          method: 'PATCH',
          body: {
            content: 'Error reading player data',
          },
        });
      }
      return;
    } else if (name === 'playericons') {
      try {
        const userId1 = data.options[0].value;
        const userId2 = data.options[1]?.value; // Optional second user ID
        const guildId = req.body.guild_id;
        const guild = await client.guilds.fetch(guildId);
        
        await res.send({
          type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
        });

        // Process first member (always required)
        const member1 = await guild.members.fetch(userId1);
        const avatarURL1 = member1.avatarURL({ size: 128 }) || member1.user.avatarURL({ size: 128 });

        if (!avatarURL1) {
          throw new Error('Could not fetch avatar for first user');
        }

        // Create first emoji and store data
        const emoji1 = await guild.emojis.create({ attachment: avatarURL1, name: userId1 });
        await updatePlayer(userId1, { 
          emojiCode: `<:${emoji1.name}:${emoji1.id}>`
        });
        console.log(`Stored emoji for ${member1.displayName}: <:${emoji1.name}:${emoji1.id}>`);

        // Process second member if provided
        let member2, emoji2;
        if (userId2) {
          member2 = await guild.members.fetch(userId2);
          const avatarURL2 = member2.avatarURL({ size: 128 }) || member2.user.avatarURL({ size: 128 });
          
          if (!avatarURL2) {
            throw new Error('Could not fetch avatar for second user');
          }

          emoji2 = await guild.emojis.create({ attachment: avatarURL2, name: userId2 });
          await updatePlayer(userId2, { 
            emojiCode: `<:${emoji2.name}:${emoji2.id}>`
          });
          console.log(`Stored emoji for ${member2.displayName}: <:${emoji2.name}:${emoji2.id}>`);
        }

        // Verify storage
        const verifyData1 = await getPlayer(userId1);
        console.log('Stored data verification for user 1:', verifyData1);
        
        if (userId2) {
          const verifyData2 = await getPlayer(userId2);
          console.log('Stored data verification for user 2:', verifyData2);
        }

        // Prepare response content based on whether there's one or two users
        const content = userId2 ? 
          `Created emojis for ${member1.displayName} and ${member2.displayName}!\n<:${emoji1.name}:${emoji1.id}> <:${emoji2.name}:${emoji2.id}>\n\nEmoji codes:\n\`<:${emoji1.name}:${emoji1.id}>\`\n\`<:${emoji2.name}:${emoji2.id}>\`` :
          `Created emoji for ${member1.displayName}!\n<:${emoji1.name}:${emoji1.id}>\n\nEmoji code:\n\`<:${emoji1.name}:${emoji1.id}>\``;

        // Prepare embeds based on whether there's one or two users
        const embeds = userId2 ? 
          [{ image: { url: avatarURL1 } }, { image: { url: member2.avatarURL({ size: 128 }) || member2.user.avatarURL({ size: 128 }) } }] :
          [{ image: { url: avatarURL1 } }];

        // Send success message
        const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
        await DiscordRequest(endpoint, {
          method: 'PATCH',
          body: {
            content,
            embeds
          },
        });

      } catch (error) {
        console.error('Error in playericons command:', error);
        const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
        await DiscordRequest(endpoint, {
          method: 'PATCH',
          body: {
            content: 'Error creating emojis. This might be because:\n- The server has reached its emoji limit\n- One or more images are too large\n- The bot lacks permissions\n- Invalid user IDs provided',
            flags: InteractionResponseFlags.EPHEMERAL,
          },
        });
      }
      return;
    } else if (name === 'settribe1') {
      try {
        await res.send({
          type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
        });

        const tribeRoleId = data.options[0].value;
        const rawData = fs.readFileSync('./tribes.json');
        const tribesCfg = JSON.parse(rawData);
        tribesCfg.tribe1 = tribeRoleId;
        const emojiOption = data.options.find(o => o.name === 'emoji');
        tribesCfg.tribe1emoji = emojiOption?.value || null;
        fs.writeFileSync('./tribes.json', JSON.stringify(tribesCfg, null, 2));

        const guildId = req.body.guild_id;
        const guild = await client.guilds.fetch(guildId);
        const members = await guild.members.fetch();
        const targetMembers = members.filter(m => m.roles.cache.has(tribeRoleId));
        const playerData = await loadPlayerData();

        let resultLines = [];
        let existingLines = [];

        for (const [_, member] of targetMembers) {
          try {
            // Check if player already has an emoji
            const existingPlayer = playerData.players[member.id];
            if (existingPlayer?.emojiCode) {
              existingLines.push(`${member.displayName}: Already has emoji \`${existingPlayer.emojiCode}\``);
              continue;
            }

            const avatarUrl = member.avatarURL({ size:128 }) || member.user.avatarURL({ size:128 });
            if (!avatarUrl) continue;

            const emoji = await guild.emojis.create({ attachment: avatarUrl, name: member.id });
            const emojiCode = `<:${emoji.name}:${emoji.id}>`;
            await updatePlayer(member.id, { emojiCode });
            resultLines.push(`${member.displayName} ${emojiCode} \`${emojiCode}\``);
          } catch (err) {
            console.error('Error creating emoji for', member.displayName, err);
          }
        }

        const messageLines = [
          `Tribe1 role updated to ${tribeRoleId}`,
          '',
          'Player Emojis:'
        ];

        if (resultLines.length > 0) {
          messageLines.push('New emojis created:');
          messageLines.push(...resultLines);
        }

        if (existingLines.length > 0) {
          if (resultLines.length > 0) messageLines.push(''); // Add spacing
          messageLines.push('Existing emojis found:');
          messageLines.push(...existingLines);
        }

        const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
        await DiscordRequest(endpoint, {
          method: 'PATCH',
          body: {
            content: messageLines.join('\n'),
            flags: InteractionResponseFlags.EPHEMERAL
          },
        });

        return;
      } catch (error) {
        console.error('Error setting tribe1:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'Error updating tribe1 role',
            flags: InteractionResponseFlags.EPHEMERAL
          },
        });
      }
    } else if (name === 'settribe2') {
      try {
        await res.send({
          type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
        });

        const tribeRoleId = data.options.find(option => option.name === 'role').value;
        const emojiOption = data.options.find(option => option.name === 'emoji');
        const tribeEmoji = emojiOption ? emojiOption.value : null;

        const rawData = fs.readFileSync('./tribes.json');
        const tribesCfg = JSON.parse(rawData);
        tribesCfg.tribe2 = tribeRoleId;
        tribesCfg.tribe2emoji = tribeEmoji;
        fs.writeFileSync('./tribes.json', JSON.stringify(tribesCfg, null, 2));

        const guildId = req.body.guild_id;
        const guild = await client.guilds.fetch(guildId);
        const members = await guild.members.fetch();
        const targetMembers = members.filter(m => m.roles.cache.has(tribeRoleId));
        const playerData = await loadPlayerData();

        let resultLines = [];
        let existingLines = [];
        let errorLines = [];
        let maxEmojiReached = false;

        for (const [_, member] of targetMembers) {
          try {
            // Check if player already has an emoji
            const existingPlayer = playerData.players[member.id];
            if (existingPlayer?.emojiCode) {
              existingLines.push(`${member.displayName}: Already has emoji \`${existingPlayer.emojiCode}\``);
              continue;
            }

            const avatarUrl = member.avatarURL({ size: 128 }) || member.user.avatarURL({ size: 128 });
            if (!avatarUrl) continue;

            try {
              const emoji = await guild.emojis.create({ attachment: avatarUrl, name: member.id });
              const emojiCode = `<:${emoji.name}:${emoji.id}>`;
              await updatePlayer(member.id, { emojiCode });
              resultLines.push(`${member.displayName} ${emojiCode} \`${emojiCode}\``);
            } catch (emojiError) {
              if (emojiError.code === 30008) {
                const limit = emojiError.rawError?.message.match(/\((\d+)\)/)?.[1] || '50';
                errorLines.push(`${member.displayName}: Failed to upload emoji - maximum number of server emojis reached (${limit}). Please delete some emojis from the server and run the command again.`);
                maxEmojiReached = true;
              } else {
                errorLines.push(`${member.displayName}: Failed to upload emoji - unknown error encountered.`);
                console.error(`Error creating emoji for ${member.displayName}:`, emojiError);
              }
            }
          } catch (err) {
            console.error('Error processing member', member.displayName, err);
            errorLines.push(`${member.displayName}: Failed to process member - unknown error encountered.`);
          }
        }

        const messageLines = [
          `Tribe2 role updated to ${tribeRoleId}`,
          ''
        ];

        if (resultLines.length > 0) {
          messageLines.push('Successfully created emojis:');
          messageLines.push(...resultLines);
          messageLines.push('');
        }

        if (existingLines.length > 0) {
          messageLines.push('Existing emojis found:');
          messageLines.push(...existingLines);
          messageLines.push('');
        }

        if (errorLines.length > 0) {
          messageLines.push('Errors encountered:');
          messageLines.push(...errorLines);
        }

        if (maxEmojiReached) {
          messageLines.push('');
          messageLines.push('⚠️ Server emoji limit reached. Some emojis could not be created.');
        }

        const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
        await DiscordRequest(endpoint, {
          method: 'PATCH',
          body: {
            content: messageLines.join('\n'),
            flags: InteractionResponseFlags.EPHEMERAL
          },
        });

        return;
      } catch (error) {
        console.error('Error setting tribe2:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'Error updating tribe2 role',
            flags: InteractionResponseFlags.EPHEMERAL
          },
        });
      }
    } else if (name === 'settribe3') {
      try {
        await res.send({
          type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
        });

        const tribeRoleId = data.options.find(option => option.name === 'role').value;
        const emojiOption = data.options.find(option => option.name === 'emoji');
        const tribeEmoji = emojiOption ? emojiOption.value : null;

        const rawData = fs.readFileSync('./tribes.json');
        const tribesCfg = JSON.parse(rawData);
        tribesCfg.tribe3 = tribeRoleId;
        tribesCfg.tribe3emoji = tribeEmoji;
        fs.writeFileSync('./tribes.json', JSON.stringify(tribesCfg, null, 2));

        const guildId = req.body.guild_id;
        const guild = await client.guilds.fetch(guildId);
        const members = await guild.members.fetch();
        const targetMembers = members.filter(m => m.roles.cache.has(tribeRoleId));
        const playerData = await loadPlayerData();

        let resultLines = [];
        let existingLines = [];
        let errorLines = [];
        let maxEmojiReached = false;

        for (const [_, member] of targetMembers) {
          try {
            // Check if player already has an emoji
            const existingPlayer = playerData.players[member.id];
            if (existingPlayer?.emojiCode) {
              existingLines.push(`${member.displayName}: Already has emoji \`${existingPlayer.emojiCode}\``);
              continue;
            }

            const avatarUrl = member.avatarURL({ size: 128 }) || member.user.avatarURL({ size: 128 });
            if (!avatarUrl) continue;

            try {
              const emoji = await guild.emojis.create({ attachment: avatarUrl, name: member.id });
              const emojiCode = `<:${emoji.name}:${emoji.id}>`;
              await updatePlayer(member.id, { emojiCode });
              resultLines.push(`${member.displayName} ${emojiCode} \`${emojiCode}\``);
            } catch (emojiError) {
              if (emojiError.code === 30008) {
                const limit = emojiError.rawError?.message.match(/\((\d+)\)/)?.[1] || '50';
                errorLines.push(`${member.displayName}: Failed to upload emoji - maximum number of server emojis reached (${limit}). Please delete some emojis from the server and run the command again.`);
                maxEmojiReached = true;
              } else {
                errorLines.push(`${member.displayName}: Failed to upload emoji - unknown error encountered.`);
                console.error(`Error creating emoji for ${member.displayName}:`, emojiError);
              }
            }
          } catch (err) {
            console.error('Error processing member', member.displayName, err);
            errorLines.push(`${member.displayName}: Failed to process member - unknown error encountered.`);
          }
        }

        const messageLines = [
          `Tribe3 role updated to ${tribeRoleId}`,
          ''
        ];

        if (resultLines.length > 0) {
          messageLines.push('Successfully created emojis:');
          messageLines.push(...resultLines);
          messageLines.push('');
        }

        if (existingLines.length > 0) {
          messageLines.push('Existing emojis found:');
          messageLines.push(...existingLines);
          messageLines.push('');
        }

        if (errorLines.length > 0) {
          messageLines.push('Errors encountered:');
          messageLines.push(...errorLines);
        }

        if (maxEmojiReached) {
          messageLines.push('');
          messageLines.push('⚠️ Server emoji limit reached. Some emojis could not be created.');
        }

        const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
        await DiscordRequest(endpoint, {
          method: 'PATCH',
          body: {
            content: messageLines.join('\n'),
            flags: InteractionResponseFlags.EPHEMERAL
          },
        });

        return;
      } catch (error) {
        console.error('Error setting tribe3:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'Error updating tribe3 role',
            flags: InteractionResponseFlags.EPHEMERAL
          },
        });
      }
    } else if (name === 'settribe4') {
      try {
        await res.send({
          type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
        });

        const tribeRoleId = data.options.find(option => option.name === 'role').value;
        const emojiOption = data.options.find(option => option.name === 'emoji');
        const tribeEmoji = emojiOption ? emojiOption.value : null;

        const rawData = fs.readFileSync('./tribes.json');
        const tribesCfg = JSON.parse(rawData);
        tribesCfg.tribe4 = tribeRoleId;
        tribesCfg.tribe4emoji = tribeEmoji;
        fs.writeFileSync('./tribes.json', JSON.stringify(tribesCfg, null, 2));

        const guildId = req.body.guild_id;
        const guild = await client.guilds.fetch(guildId);
        const members = await guild.members.fetch();
        const targetMembers = members.filter(m => m.roles.cache.has(tribeRoleId));
        const playerData = await loadPlayerData();

        let resultLines = [];
        let existingLines = [];
        let errorLines = [];
        let maxEmojiReached = false;

        for (const [_, member] of targetMembers) {
          try {
            // Check if player already has an emoji
            const existingPlayer = playerData.players[member.id];
            if (existingPlayer?.emojiCode) {
              existingLines.push(`${member.displayName}: Already has emoji \`${existingPlayer.emojiCode}\``);
              continue;
            }

            const avatarUrl = member.avatarURL({ size: 128 }) || member.user.avatarURL({ size: 128 });
            if (!avatarUrl) continue;

            try {
              const emoji = await guild.emojis.create({ attachment: avatarUrl, name: member.id });
              const emojiCode = `<:${emoji.name}:${emoji.id}>`;
              await updatePlayer(member.id, { emojiCode });
              resultLines.push(`${member.displayName} ${emojiCode} \`${emojiCode}\``);
            } catch (emojiError) {
              if (emojiError.code === 30008) {
                const limit = emojiError.rawError?.message.match(/\((\d+)\)/)?.[1] || '50';
                errorLines.push(`${member.displayName}: Failed to upload emoji - maximum number of server emojis reached (${limit}). Please delete some emojis from the server and run the command again.`);
                maxEmojiReached = true;
              } else {
                errorLines.push(`${member.displayName}: Failed to upload emoji - unknown error encountered.`);
                console.error(`Error creating emoji for ${member.displayName}:`, emojiError);
              }
            }
          } catch (err) {
            console.error('Error processing member', member.displayName, err);
            errorLines.push(`${member.displayName}: Failed to process member - unknown error encountered.`);
          }
        }

        const messageLines = [
          `Tribe4 role updated to ${tribeRoleId}`,
          ''
        ];

        if (resultLines.length > 0) {
          messageLines.push('Successfully created emojis:');
          messageLines.push(...resultLines);
          messageLines.push('');
        }

        if (existingLines.length > 0) {
          messageLines.push('Existing emojis found:');
          messageLines.push(...existingLines);
          messageLines.push('');
        }

        if (errorLines.length > 0) {
          messageLines.push('Errors encountered:');
          messageLines.push(...errorLines);
        }

        if (maxEmojiReached) {
          messageLines.push('');
          messageLines.push('⚠️ Server emoji limit reached. Some emojis could not be created.');
        }

        const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
        await DiscordRequest(endpoint, {
          method: 'PATCH',
          body: {
            content: messageLines.join('\n'),
            flags: InteractionResponseFlags.EPHEMERAL
          },
        });

        return;
      } catch (error) {
        console.error('Error setting tribe4:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'Error updating tribe4 role',
            flags: InteractionResponseFlags.EPHEMERAL
          },
        });
      }
    } else if (name === 'cleartribe2') {
      try {
        console.log('Received /cleartribe2 command');
        await res.send({
          type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
        });

        const guildId = req.body.guild_id;
        console.log(`Guild ID: ${guildId}`);
        const guild = await client.guilds.fetch(guildId);
        console.log(`Fetched guild: ${guild.name}`);

        const rawData = fs.readFileSync('./tribes.json');
        const tribesCfg = JSON.parse(rawData);
        const tribeRoleId = tribesCfg.tribe2;

        if (!tribeRoleId) {
          console.log('No role ID found for tribe2');
          const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
          await DiscordRequest(endpoint, {
            method: 'PATCH',
            body: {
              content: 'No role ID found for tribe2',
              flags: InteractionResponseFlags.EPHEMERAL
            },
          });
          return;
        }

        console.log(`Tribe Role ID: ${tribeRoleId}`);
        const members = await guild.members.fetch();
        console.log(`Fetched ${members.size} members`);
        const targetMembers = members.filter(m => m.roles.cache.has(tribeRoleId));
        console.log(`Found ${targetMembers.size} members with tribe role`);

        const playerData = await loadPlayerData();
        console.log('Loaded player data');
        let resultLines = [];

        for (const [_, member] of targetMembers) {
          if (playerData.players[member.id] && playerData.players[member.id].emojiCode) {
            const match = playerData.players[member.id].emojiCode.match(/<:\w+:(\d+)>/);
            if (match && match[1]) {
              try {
                console.log(`Attempting to delete emoji with ID: ${match[1]} for ${member.displayName}`);
                await guild.emojis.delete(match[1]);
                console.log(`Deleted emoji for ${member.displayName}`);
                resultLines.push(`Deleted emoji for ${member.displayName}`);
              } catch (err) {
                console.error(`Error deleting emoji for ${member.displayName}:`, err);
                resultLines.push(`Failed to delete emoji for ${member.displayName}`);
              }
            }
            delete playerData.players[member.id].emojiCode;
            console.log(`Deleted emojiCode for ${member.displayName}`);
          } else {
            console.log(`No emojiCode found for ${member.displayName}`);
          }
        }

        fs.writeFileSync('./playerData.json', JSON.stringify(playerData, null, 2));
        console.log('Updated playerData.json');

        tribesCfg.tribe2 = null;
        tribesCfg.tribe2emoji = null;
        fs.writeFileSync('./tribes.json', JSON.stringify(tribesCfg, null, 2));
        console.log('Updated tribes.json');

        const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
        await DiscordRequest(endpoint, {
          method: 'PATCH',
          body: {
            content: `Tribe2 role cleared and emojis deleted:\n${resultLines.join('\n')}`,
            flags: InteractionResponseFlags.EPHEMERAL
          },
        });

        return;
      } catch (error) {
        console.error('Error clearing tribe2:', error);
        const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
        await DiscordRequest(endpoint, {
          method: 'PATCH',
          body: {
            content: 'Error clearing tribe2 role',
            flags: InteractionResponseFlags.EPHEMERAL
          },
        });
      }
    } else if (name === 'clearemoji') {
      try {
        await res.send({
          type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
        });

        const guildId = req.body.guild_id;
        const guild = await client.guilds.fetch(guildId);
        const playerData = await loadPlayerData();

        for (const [playerId, data] of Object.entries(playerData)) {
          if (data.emojiCode) {
            const match = data.emojiCode.match(/<:\w+:(\d+)>/);
            if (match && match[1]) {
              try {
                await guild.emojis.delete(match[1]);
              } catch {}
            }
            data.emojiCode = null;
          }
        }

        fs.writeFileSync('./playerData.json', JSON.stringify(playerData, null, 2));

        const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
        await DiscordRequest(endpoint, {
          method: 'PATCH',
          body: {
            content: 'All saved emojis have been cleared.',
            flags: InteractionResponseFlags.EPHEMERAL
          },
        });
        return;
      } catch (error) {
        console.error('Error clearing emojis:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'Error clearing emojis.',
            flags: InteractionResponseFlags.EPHEMERAL,
          },
        });
      }
    } else if (name === 'cleartribe1' || name === 'cleartribe2' || name === 'cleartribe3' || name === 'cleartribe4') {
      try {
        console.log(`Received /${name} command`);
        await res.send({
          type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
        });

        const guildId = req.body.guild_id;
        const guild = await client.guilds.fetch(guildId);
        console.log(`Fetched guild: ${guild.name}`);

        const rawData = fs.readFileSync('./tribes.json');
        const tribesCfg = JSON.parse(rawData);
        const tribeKey = name.replace('clear', ''); // e.g. 'tribe1'
        const tribeRoleId = tribesCfg[tribeKey];

        if (!tribeRoleId) {
          console.log(`No role ID found for ${tribeKey}`);
          const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
          await DiscordRequest(endpoint, {
            method: 'PATCH',
            body: {
              content: `No role ID found for ${tribeKey}`,
              flags: InteractionResponseFlags.EPHEMERAL
            },
          });
          return;
        }

        console.log(`Tribe Role ID: ${tribeRoleId}`);
        const members = await guild.members.fetch();
        const targetMembers = members.filter(m => m.roles.cache.has(tribeRoleId));
        console.log(`Found ${targetMembers.size} members with tribe role`);

        const playerData = await loadPlayerData(guildId);
        let resultLines = [];

        for (const [_, member] of targetMembers) {
          if (playerData[member.id] && playerData[member.id].emojiCode) {
            const match = playerData[member.id].emojiCode.match(/<:\w+:(\d+)>/);
            if (match && match[1]) {
              try {
                await guild.emojis.delete(match[1]);
                console.log(`Deleted emoji for ${member.displayName}`);
                resultLines.push(`Deleted emoji for ${member.displayName}`);
              } catch (err) {
                console.error(`Error deleting emoji for ${member.displayName}:`, err);
                resultLines.push(`Failed to delete emoji for ${member.displayName}`);
              }
            }
            playerData[member.id].emojiCode = null;
          }
        }

        fs.writeFileSync('./playerData.json', JSON.stringify(playerData, null, 2));
        console.log('Updated playerData.json');

        tribesCfg[tribeKey] = null;
        tribesCfg[`${tribeKey}emoji`] = null;
        fs.writeFileSync('./tribes.json', JSON.stringify(tribesCfg, null, 2));
        console.log('Updated tribes.json');

        const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
        await DiscordRequest(endpoint, {
          method: 'PATCH',
          body: {
            content: `${name} role cleared and emojis deleted:\n${resultLines.join('\n')}`,
            flags: InteractionResponseFlags.EPHEMERAL
          },
        });

        return;
      } catch (error) {
        console.error(`Error clearing ${name}:`, error);
        const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
        await DiscordRequest(endpoint, {
          method: 'PATCH',
          body: {
            content: `Error clearing ${name} role`,
            flags: InteractionResponseFlags.EPHEMERAL
          },
        });
      }
    } else if (name === 'cleartribeall') {
      try {
        await res.send({ type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE });
    
        let resultLines = [];
        const rawData = fs.readFileSync('./tribes.json');
        const tribesCfg = JSON.parse(rawData);
        const guildId = req.body.guild_id;
        const guild = await client.guilds.fetch(guildId);
        const allRoleIds = [];
    
        // Collect all tribe roles
        for (const key of ['tribe1','tribe2','tribe3','tribe4']) {
          if (tribesCfg[key]) {
            allRoleIds.push(tribesCfg[key]);
            tribesCfg[key] = null;
            tribesCfg[key + 'emoji'] = null;
          }
        }
        fs.writeFileSync('./tribes.json', JSON.stringify(tribesCfg, null, 2));
    
        const members = await guild.members.fetch();
        const playerData = await loadPlayerData();
    
        for (const [playerId, data] of Object.entries(playerData)) {
          // Check if player has any of the old tribe roles
          const member = members.get(playerId);
          if (member && allRoleIds.some(roleId => member.roles.cache.has(roleId))) {
            const emojiCode = data.emojiCode;
            if (emojiCode) {
              const match = emojiCode.match(/<:\w+:(\d+)>/);
              if (match && match[1]) {
                try {
                  await guild.emojis.delete(match[1]);
                  resultLines.push(`Deleted emoji for ${member.displayName}`);
                } catch {}
              }
            }
            delete playerData[playerId];
            resultLines.push(`Removed player entry for ${member.displayName}`);
          }
        }
        fs.writeFileSync('./playerData.json', JSON.stringify(playerData, null, 2));
    
        const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
        await DiscordRequest(endpoint, {
          method: 'PATCH',
          body: {
            content: `Cleared all tribes, set all to null\n${resultLines.join('\n')}`,
            flags: InteractionResponseFlags.EPHEMERAL
          },
        });
    
        return;
      } catch (err) {
        console.error('Error clearing all tribes:', err);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'Error clearing all tribes',
            flags: InteractionResponseFlags.EPHEMERAL
          },
        });
      }
    } else if (name === 'setageall') {
      try {
        console.log('Processing setageall command');
        const updates = [];

        // Extract player IDs and ages from the command options
        for (let i = 1; i <= 24; i++) {
          const playerOption = data.options.find(option => option.name === `player${i}`);
          const ageOption = data.options.find(option => option.name === `player${i}_age`);
          if (playerOption && ageOption) {
            updates.push({ playerId: playerOption.value, age: ageOption.value });
          }
        }

        // Load existing player data
        const rawData = fs.readFileSync('./playerData.json');
        const playerData = JSON.parse(rawData);

        // Update player data
        updates.forEach(({ playerId, age }) => {
          if (playerData.players[playerId]) {
            playerData.players[playerId].age = age;
          } else {
            playerData.players[playerId] = { age };
          }
        });

        fs.writeFileSync('./playerData.json', JSON.stringify(playerData, null, 2));
        res.send({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: 'Ages updated successfully.' } });
      } catch (err) {
        console.error('Error processing setageall command:', err);
        res.send({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: 'Failed to update ages.' } });
      }
      return;
    } else if (name === 'util_deleteserveremoji') {
      try {
        console.log('Received /util_deleteserveremoji command');
        await res.send({
          type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
        });

        const emojiId = data.options.find(option => option.name === 'emojiid').value;
        console.log(`Emoji ID to delete: ${emojiId}`);

        const guildId = req.body.guild_id;
        const guild = await client.guilds.fetch(guildId);
        console.log(`Fetched guild: ${guild.name}`);

        try {
          await guild.emojis.delete(emojiId);
          console.log(`Deleted emoji with ID: ${emojiId}`);

          const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
          await DiscordRequest(endpoint, {
            method: 'PATCH',
            body: {
              content: `Successfully deleted emoji with ID: ${emojiId}`,
              flags: InteractionResponseFlags.EPHEMERAL
            },
          });
        } catch (err) {
          console.error(`Error deleting emoji with ID: ${emojiId}`, err);
          const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
          await DiscordRequest(endpoint, {
            method: 'PATCH',
            body: {
              content: `Failed to delete emoji with ID: ${emojiId}. Error: ${err.message}`,
              flags: InteractionResponseFlags.EPHEMERAL
            },
          });
        }

        return;
      } catch (error) {
        console.error('Error handling /util_deleteserveremoji command:', error);
        const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
        await DiscordRequest(endpoint, {
          method: 'PATCH',
          body: {
            content: 'Error handling /util_deleteserveremoji command',
            flags: InteractionResponseFlags.EPHEMERAL
          },
        });
      }
    } else if (name === 'util_deleteplayeremoji') {
      try {
        console.log('Received /util_deleteplayeremoji command');
        await res.send({
          type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
        });

        const userId = data.options.find(option => option.name === 'userid').value;
        console.log(`User ID to delete emoji for: ${userId}`);

        const guildId = req.body.guild_id;
        const guild = await client.guilds.fetch(guildId);
        console.log(`Fetched guild: ${guild.name}`);

        const playerData = await loadPlayerData();
        if (!playerData.players[userId]) {
          console.log(`No player data found for user ID: ${userId}`);
          const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
          await DiscordRequest(endpoint, {
            method: 'PATCH',
            body: {
              content: `No player data found for user ID: ${userId}`,
              flags: InteractionResponseFlags.EPHEMERAL
            },
          });
          return;
        }

        const emojiCode = playerData.players[userId].emojiCode;
        if (!emojiCode) {
          console.log(`No emojiCode found for user ID: ${userId}`);
          const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
          await DiscordRequest(endpoint, {
            method: 'PATCH',
            body: {
              content: `No emojiCode found for user ID: ${userId}`,
              flags: InteractionResponseFlags.EPHEMERAL
            },
          });
          return;
        }

        const match = emojiCode.match(/<:\w+:(\d+)>/);
        if (!match || !match[1]) {
          console.log(`Invalid emojiCode format for user ID: ${userId}`);
          const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
          await DiscordRequest(endpoint, {
            method: 'PATCH',
            body: {
              content: `Invalid emojiCode format for user ID: ${userId}`,
              flags: InteractionResponseFlags.EPHEMERAL
            },
          });
          return;
        }

        const emojiId = match[1];
        console.log(`Emoji ID to delete: ${emojiId}`);

        let emojiDeleted = false;
        try {
          await guild.emojis.delete(emojiId);
          console.log(`Deleted emoji with this ID: ${emojiId}`);
          emojiDeleted = true;
        } catch (err) {
          console.error(`Error deleting emoji with ID: ${emojiId}`, err);
        }

        delete playerData.players[userId].emojiCode;
        fs.writeFileSync('./playerData.json', JSON.stringify(playerData, null, 2));
        console.log(`Deleted emojiCode for user ID: ${userId}`);

        const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
        await DiscordRequest(endpoint, {
          method: 'PATCH',
          body: {
            content: emojiDeleted
              ? `Successfully deleted emoji and emojiCode for user ID: ${userId}`
              : `Failed to delete emoji from server, but deleted emojiCode for user ID: ${userId}`,
            flags: InteractionResponseFlags.EPHEMERAL
          },
        });

        return;
      } catch (error) {
        console.error('There was an error handling /util_deleteplayeremoji command:', error);
        const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
        await DiscordRequest(endpoint, {
          method: 'PATCH',
          body: {
            content: 'Error handling /util_deleteplayeremoji command',
            flags: InteractionResponseFlags.EPHEMERAL
          },
        });
      }
    } else if (name === 'addpronouns') {
      try {
        console.log('Processing addpronouns command');
        await res.send({
          type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
        });

        // Get all role options that were provided
        const roleOptions = ['role1', 'role2', 'role3']
          .map(roleName => data.options.find(opt => opt.name === roleName))
          .filter(opt => opt !== undefined)
          .map(opt => opt.value);

        console.log('Roles to add:', roleOptions);

        // Load current pronouns
        const pronounsData = JSON.parse(fs.readFileSync('./pronouns.json'));
        const currentPronouns = new Set(pronounsData.pronounRoleIDs);
        const added = [];
        const alreadyExists = [];

        // Add new roles
        roleOptions.forEach(roleId => {
          if (currentPronouns.has(roleId)) {
            alreadyExists.push(roleId);
          } else {
            currentPronouns.add(roleId);
            added.push(roleId);
          }
        });

        // Save updated pronouns
        pronounsData.pronounRoleIDs = Array.from(currentPronouns);
        fs.writeFileSync('./pronouns.json', JSON.stringify(pronounsData, null, 2));

        // Prepare response message
        const addedMsg = added.length > 0 ? `Added roles: ${added.join(', ')}` : '';
        const existsMsg = alreadyExists.length > 0 ? `Already existed: ${alreadyExists.join(', ')}` : '';
        const message = [addedMsg, existsMsg].filter(msg => msg).join('\n');

        const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
        await DiscordRequest(endpoint, {
          method: 'PATCH',
          body: {
            content: message || 'No changes made to pronoun roles.',
            flags: InteractionResponseFlags.EPHEMERAL
          },
        });
      } catch (error) {
        console.error('Error processing addpronouns command:', error);
        const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
        await DiscordRequest(endpoint, {
          method: 'PATCH',
          body: {
            content: 'Error updating pronoun roles.',
            flags: InteractionResponseFlags.EPHEMERAL
          },
        });
      }
      return;
    } else if (name === 'removepronouns') {
      try {
        console.log('Processing removepronouns command');
        await res.send({
          type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
        });

        // Get all role options that were provided
        const roleOptions = ['role1', 'role2', 'role3']
          .map(roleName => data.options.find(opt => opt.name === roleName))
          .filter(opt => opt !== undefined)
          .map(opt => opt.value);

        console.log('Roles to remove:', roleOptions);

        // Load current pronouns
        const pronounsData = JSON.parse(fs.readFileSync('./pronouns.json'));
        const currentPronouns = new Set(pronounsData.pronounRoleIDs);
        const removed = [];
        const notFound = [];

        // Remove roles
        roleOptions.forEach(roleId => {
          if (currentPronouns.has(roleId)) {
            currentPronouns.delete(roleId);
            removed.push(roleId);
          } else {
            notFound.push(roleId);
          }
        });

        // Save updated pronouns
        pronounsData.pronounRoleIDs = Array.from(currentPronouns);
        fs.writeFileSync('./pronouns.json', JSON.stringify(pronounsData, null, 2));

        // Prepare response message
        const removedMsg = removed.length > 0 ? `Removed roles: ${removed.join(', ')}` : '';
        const notFoundMsg = notFound.length > 0 ? `Not found: ${notFound.join(', ')}` : '';
        const message = [removedMsg, notFoundMsg].filter(msg => msg).join('\n');

        const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
        await DiscordRequest(endpoint, {
          method: 'PATCH',
          body: {
            content: message || 'No changes made to pronoun roles.',
            flags: InteractionResponseFlags.EPHEMERAL
          },
        });
      } catch (error) {
        console.error('Error processing removepronouns command:', error);
        const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
        await DiscordRequest(endpoint, {
          method: 'PATCH',
          body: {
            content: 'Error updating pronoun roles.',
            flags: InteractionResponseFlags.EPHEMERAL
          },
        });
      }
      return;
    } else if (name.startsWith('settribe') && /settribe[1-4]$/.test(name)) {
      try {
        await res.send({
          type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
        });

        // Extract tribe number from command name
        const tribeNum = name.charAt(name.length - 1);
        const tribeKey = `tribe${tribeNum}`;
        const tribeEmojiKey = `tribe${tribeNum}emoji`;

        const tribeRoleId = data.options.find(option => option.name === 'role')?.value || data.options[0].value;
        const emojiOption = data.options.find(option => option.name === 'emoji');
        const tribeEmoji = emojiOption?.value || null;

        const rawData = fs.readFileSync('./tribes.json');
        const tribesCfg = JSON.parse(rawData);
        tribesCfg[tribeKey] = tribeRoleId;
        tribesCfg[tribeEmojiKey] = tribeEmoji;
        fs.writeFileSync('./tribes.json', JSON.stringify(tribesCfg, null, 2));

        const guildId = req.body.guild_id;
        const guild = await client.guilds.fetch(guildId);
        const members = await guild.members.fetch();
        const targetMembers = members.filter(m => m.roles.cache.has(tribeRoleId));
        const playerData = await loadPlayerData();

        let resultLines = [];
        let existingLines = [];
        let errorLines = [];
        let maxEmojiReached = false;

        for (const [_, member] of targetMembers) {
          try {
            // Check if player already has an emoji
            const existingPlayer = playerData.players[member.id];
            if (existingPlayer?.emojiCode) {
              existingLines.push(`${member.displayName}: Already has emoji \`${existingPlayer.emojiCode}\``);
              continue;
            }

            const avatarUrl = member.avatarURL({ size: 128 }) || member.user.avatarURL({ size: 128 });
            if (!avatarUrl) continue;

            try {
              const emoji = await guild.emojis.create({ attachment: avatarUrl, name: member.id });
              const emojiCode = `<:${emoji.name}:${emoji.id}>`;
              await updatePlayer(member.id, { emojiCode });
              resultLines.push(`${member.displayName} ${emojiCode} \`${emojiCode}\``);
            } catch (emojiError) {
              if (emojiError.code === 30008) {
                const limit = emojiError.rawError?.message.match(/\((\d+)\)/)?.[1] || '50';
                errorLines.push(`${member.displayName}: Failed to upload emoji - maximum number of server emojis reached (${limit}). Please delete some emojis from the server and run the command again.`);
                maxEmojiReached = true;
              } else {
                errorLines.push(`${member.displayName}: Failed to upload emoji - unknown error encountered.`);
                console.error(`Error creating emoji for ${member.displayName}:`, emojiError);
              }
            }
          } catch (err) {
            console.error('Error processing member', member.displayName, err);
            errorLines.push(`${member.displayName}: Failed to process member - unknown error encountered.`);
          }
        }

        const messageLines = [
          `${tribeKey} role updated to ${tribeRoleId}`,
          ''
        ];

        if (resultLines.length > 0) {
          messageLines.push('Successfully created emojis:');
          messageLines.push(...resultLines);
          messageLines.push('');
        }

        if (existingLines.length > 0) {
          messageLines.push('Existing emojis found:');
          messageLines.push(...existingLines);
          messageLines.push('');
        }

        if (errorLines.length > 0) {
          messageLines.push('Errors encountered:');
          messageLines.push(...errorLines);
        }

        if (maxEmojiReached) {
          messageLines.push('');
          messageLines.push('⚠️ Server emoji limit reached. Some emojis could not be created.');
        }

        const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
        await DiscordRequest(endpoint, {
          method: 'PATCH',
          body: {
            content: messageLines.join('\n'),
            flags: InteractionResponseFlags.EPHEMERAL
          },
        });

        return;
      } catch (error) {
        console.error(`Error setting ${name}:`, error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `Error updating ${name} role`,
            flags: InteractionResponseFlags.EPHEMERAL
          },
        });
      }
    } else if (name === 'jeffiscool') {
      try {
        await res.send({
          type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
        });

        const asciiArt = `
\`\`\`
  ____ _______ _______
 / ___|__  /  _ \\__  /
 \\___ \\ / /| | | | / /
  ___) / /_| |_| |/ /_
 |____/____|\\___//____|

  ______      _  _
 | ___ \\    (_)| |
 | |_/ / ___  | || |__
 |  __/ / _ \\ | || '_ \\
 | |   |  __/ | || |_) |
 \\_|    \\___| |_||_.__/
\`\`\`
`;
        const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
        await DiscordRequest(endpoint, {
          method: 'PATCH',
          body: {
            content: asciiArt,
            flags: InteractionResponseFlags.EPHEMERAL
          },
        });
        return;
      } catch (error) {
        console.error('Error handling jeffiscool command:', error);
        const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
        await DiscordRequest(endpoint, {
          method: 'PATCH',
          body: {
            content: 'Error handling jeffiscool command',
            flags: InteractionResponseFlags.EPHEMERAL
          },
        });
      }
    } else {
      console.error('unknown interaction type', type);
      return res.status(400).json({ error: 'unknown interaction type' });
    }
  }

  /**
   * Handle requests from interactive components
   * See https://discord.com/developers/docs/interactions/message-components#responding-to-a-component-interaction
   */
  if (type === InteractionType.MESSAGE_COMPONENT) {
    // custom_id set in payload when sending message component
    const componentId = data.custom_id;

    if (componentId.startsWith('accept_button_')) {
      // get the associated game ID
      const gameId = componentId.replace('accept_button_', '');
      // Delete message with token in request body
      const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/${req.body.message.id}`;
      try {
        await res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'What is your object of choice?',
            // Indicates it'll be an ephemeral message
            flags: InteractionResponseFlags.EPHEMERAL,
            components: [
              {
                type: MessageComponentTypes.ACTION_ROW,
                components: [
                  {
                    type: MessageComponentTypes.STRING_SELECT,
                    // Append game ID
                    custom_id: `select_choice_${gameId}`,
                    options: getShuffledOptions(),
                  },
                ],
              },
            ],
          },
        });
        // Delete previous message
        await DiscordRequest(endpoint, { method: 'DELETE' });
      } catch (err) {
        console.error('Error sending message:', err);
      }
    } else if (componentId.startsWith('select_choice_')) {
      // get the associated game ID
      const gameId = componentId.replace('select_choice_', '');

      if (activeGames[gameId]) {
        // Interaction context
        const context = req.body.context;
        // Get user ID and object choice for responding user
        // User ID is in user field for (G)DMs, and member for servers
        const userId = context === 0 ? req.body.member.user.id : req.body.user.id;
        const objectName = data.values[0];
        // Calculate result from helper function
        const resultStr = getResult(activeGames[gameId], {
          id: userId,
          objectName,
        });

        // Remove game from storage
        delete activeGames[gameId];
        // Update message with token in request body
        const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/${req.body.message.id}`;

        try {
          // Send results
          await res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: { content: resultStr },
          });
          // Update ephemeral message
          await DiscordRequest(endpoint, {
            method: 'PATCH',
            body: {
              content: 'Nice choice ' + getRandomEmoji(),
              components: [],
            },
          });
        } catch (err) {
          console.error('Error sending message:', err);
        }
      }
    }

    return;
  }

  console.error('unknown interaction type', type);
  return res.status(400).json({ error: 'unknown interaction type' });
});

app.listen(PORT, () => {
  console.log('Listening on port', PORT);
});

// Log in to Discord with your client's token
client.login(process.env.DISCORD_TOKEN);

// Define or import missing helpers:
// function capitalize(str) { ... } 
// async function getPlayer(id) { ... }
// async function saveAllPlayerData(members, guild, roleConfig) { ... }
// async function updatePlayer(id, newData) { ... }
// async function loadPlayerData() { ... }
// async function DiscordRequest(endpoint, options) { ... }
