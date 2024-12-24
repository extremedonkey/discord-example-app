import 'dotenv/config';
import fetch from 'node-fetch';

export async function DiscordRequest(endpoint, options) {
  const url = `https://discord.com/api/v10/${endpoint}`;
  if (options.body) {
    options.body = typeof options.body === 'string'
      ? options.body
      : JSON.stringify(options.body);
  }
  const res = await fetch(url, {
    headers: {
      Authorization: `Bot ${process.env.DISCORD_TOKEN}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    ...options,
  });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(error);
  }
  return res.json();
}

export async function InstallGlobalCommands(appId, commands, guildId) {
  // URL is different for guild-based commands
  const endpoint = guildId 
    ? `applications/${appId}/guilds/${guildId}/commands`
    : `applications/${appId}/commands`;

  try {
    const res = await fetch(`https://discord.com/api/v10/${endpoint}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bot ${process.env.DISCORD_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(commands)
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Error installing commands: ${text}`);
    }

    console.log(`Successfully installed commands${guildId ? ' to guild' : ' globally'}`);
  } catch (err) {
    console.error('Error installing commands:', err);
    throw err;
  }
}

// Simple method that returns a random emoji from list
export function getRandomEmoji() {
  const emojiList = ['😭','😄','😌','🤓','😎','😤','🤖','😶‍🌫️','🌏','📸','💿','👋','🌊','✨'];
  return emojiList[Math.floor(Math.random() * emojiList.length)];
}

export function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
