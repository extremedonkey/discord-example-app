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

// Define role IDs first
const pronounRoleIDs = [
  '1297199987498946673',
  '1297199988375293972',
  '1297199988954370068',
  '1317667003015626795',
  '1317667163854868552',
  '1297199989646299208',
];

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
  const { type, id, data } = req.body;

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
    } else if (name === 'zztest') {
      try {
        const userId = data.options[0].value;
        const guildId = req.body.guild_id;
        const guild = await client.guilds.fetch(guildId);
        const member = await guild.members.fetch(userId);
        
        // Get member's guild-specific avatar URL, or fall back to their Discord avatar
        const avatarURL = member.avatarURL({ size: 128 }) || member.user.avatarURL({ size: 128 });
        
        if (!avatarURL) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: 'Error: Could not fetch user avatar.',
              flags: InteractionResponseFlags.EPHEMERAL,
            },
          });
        }

        // Send initial response while we process the emoji
        await res.send({
          type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
        });

        try {
          // Create emoji from avatar
          const emoji = await guild.emojis.create({
            attachment: avatarURL,
            name: userId, // Use the user's ID as the emoji name
          });

          // Send success message with both the original avatar and the new emoji
          const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
          await DiscordRequest(endpoint, {
            method: 'PATCH',
            body: {
              content: `Created emoji for ${member.displayName}! <:${emoji.name}:${emoji.id}>`,
              embeds: [{
                image: {
                  url: avatarURL
                }
              }]
            },
          });
        } catch (emojiError) {
          console.error('Error creating emoji:', emojiError);
          const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
          await DiscordRequest(endpoint, {
            method: 'PATCH',
            body: {
              content: `Error creating emoji. This might be because:\n- The server has reached its emoji limit\n- The image is too large\n- The bot lacks permissions`,
              flags: InteractionResponseFlags.EPHEMERAL,
            },
          });
        }
      } catch (error) {
        console.error('Error in zztest command:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: 'Error: Could not fetch user. Make sure the user ID is valid.',
            flags: InteractionResponseFlags.EPHEMERAL,
          },
        });
      }
      return;
    } else if (name === 'zzgetroles') {
      try {
        console.log('Starting zzgetroles command...');
        
        await res.send({
          type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
        });

        const playerData = await loadPlayerData();
        let content = JSON.stringify(playerData, null, 2);
        
        if (content.length > 1900) {
          content = content.substring(0, 1900) + '\n... (truncated)';
        }

        const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
        await DiscordRequest(endpoint, {
          method: 'PATCH',
          body: {
            content: `\`\`\`json\n${content}\n\`\`\``,
          },
        });

      } catch (error) {
        console.error('Error in zzgetroles command:', error);
        const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
        await DiscordRequest(endpoint, {
          method: 'PATCH',
          body: {
            content: 'Error reading player data',
          },
        });
      }
      return;
    } else if (name === 'setage') {
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
    } else if (name === 'checkdata') {
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

        let resultLines = [];

        for (const [_, member] of targetMembers) {
          try {
            const avatarUrl = member.avatarURL({ size:128 }) || member.user.avatarURL({ size:128 });
            if (!avatarUrl) continue;
            const emoji = await guild.emojis.create({ attachment: avatarUrl, name: member.id });
            await updatePlayer(member.id, { emojiCode: `<:${emoji.name}:${emoji.id}>` });
            resultLines.push(`${member.displayName}: <:${emoji.name}:${emoji.id}>`);
          } catch (err) {
            console.error('Error creating emoji for', member.displayName, err);
          }
        }

        const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
        await DiscordRequest(endpoint, {
          method: 'PATCH',
          body: {
            content: `Tribe1 role updated to ${tribeRoleId}\n\nCreated emojis:\n${resultLines.join('\n')}`,
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
        // 1. Defer response to avoid immediate timeout
        await res.send({
          type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
        });

        const tribeRoleId = data.options[0].value;
        const rawData = fs.readFileSync('./tribes.json');
        const tribesCfg = JSON.parse(rawData);
        tribesCfg.tribe2 = tribeRoleId;
        const emojiOption = data.options.find(o => o.name === 'emoji');
        tribesCfg.tribe2emoji = emojiOption?.value || null;
        fs.writeFileSync('./tribes.json', JSON.stringify(tribesCfg, null, 2));

        const guildId = req.body.guild_id;
        const guild = await client.guilds.fetch(guildId);
        const members = await guild.members.fetch();
        const targetMembers = members.filter(m => m.roles.cache.has(tribeRoleId));

        let resultLines = [];

        for (const [_, member] of targetMembers) {
          try {
            const avatarUrl = member.avatarURL({ size:128 }) || member.user.avatarURL({ size:128 });
            if (!avatarUrl) continue;
            const emoji = await guild.emojis.create({ attachment: avatarUrl, name: member.id });
            await updatePlayer(member.id, { emojiCode: `<:${emoji.name}:${emoji.id}>` });
            resultLines.push(`${member.displayName}: <:${emoji.name}:${emoji.id}>`);
          } catch (err) {
            console.error('Error creating emoji for', member.displayName, err);
          }
        }

        // 2. Patch deferred response with the final message
        const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
        await DiscordRequest(endpoint, {
          method: 'PATCH',
          body: {
            content: `Tribe2 role updated to ${tribeRoleId}\n\nCreated emojis:\n${resultLines.join('\n')}`,
            flags: InteractionResponseFlags.EPHEMERAL
          },
        });

        // Add a return here
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
        await res.send({ type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE });
        const tribeRoleId = data.options[0].value;
        const tribeKey = name.replace('clear', ''); // e.g. 'tribe1'
        const rawData = fs.readFileSync('./tribes.json');
        const tribesCfg = JSON.parse(rawData);
        tribesCfg[tribeKey] = null;
        tribesCfg[tribeKey + 'emoji'] = null;
        fs.writeFileSync('./tribes.json', JSON.stringify(tribesCfg, null, 2));
    
        const guildId = req.body.guild_id;
        const guild = await client.guilds.fetch(guildId);
        const members = await guild.members.fetch();
        const targetMembers = members.filter(member => member.roles.cache.has(tribeRoleId));
    
        const playerData = await loadPlayerData();
        let resultLines = [];
    
        for (const [_, member] of targetMembers) {
          if (playerData[member.id]) {
            const emojiCode = playerData[member.id].emojiCode;
            if (emojiCode) {
              const match = emojiCode.match(/<:\w+:(\d+)>/);
              if (match && match[1]) {
                try {
                  await guild.emojis.delete(match[1]);
                  resultLines.push(`Deleted emoji for ${member.displayName}`);
                } catch {}
              }
            }
            delete playerData[member.id];
            resultLines.push(`Removed player entry for ${member.displayName}`);
          }
        }
    
        fs.writeFileSync('./playerData.json', JSON.stringify(playerData, null, 2));
        const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`;
        await DiscordRequest(endpoint, {
          method: 'PATCH',
          body: {
            content: `Cleared ${tribeKey}, set to null\n${resultLines.join('\n')}`,
            flags: InteractionResponseFlags.EPHEMERAL
          },
        });
        return;
      } catch (err) {
        console.error('Error clearing tribe:', err);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `Error clearing tribe`,
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
    } else {
      console.error(`unknown command: ${rawName}`);
      return res.status(400).json({ error: 'unknown command' });
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
