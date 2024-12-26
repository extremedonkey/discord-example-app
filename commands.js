import 'dotenv/config';
import { getRPSChoices } from './game.js';
import { capitalize, InstallGlobalCommands } from './utils.js';
import { PermissionFlagsBits } from 'discord-api-types/v10';

// Define the required permissions using bitwise OR
const ADMIN_PERMISSIONS = (
  PermissionFlagsBits.Administrator | 
  PermissionFlagsBits.ManageChannels | 
  PermissionFlagsBits.ManageGuild | 
  PermissionFlagsBits.ManageRoles
).toString();

// Get the game choices from game.js
function createCommandChoices() {
  const choices = getRPSChoices();
  const commandChoices = [];

  for (let choice of choices) {
    commandChoices.push({
      name: capitalize(choice),
      value: choice.toLowerCase(),
    });
  }

  return commandChoices;
}

const args = process.argv.slice(2);
const isGuild = args.includes('guild');
const guildId = isGuild ? process.env.GUILD_ID : undefined;

// Helper to optionally prepend dev_
function maybePrependDev(baseName) {
  return isGuild ? `dev_${baseName}` : baseName;
}

// Simple test command
const TEST_COMMAND = {
  name: maybePrependDev('playericons'),
  description: 'Create player icons from avatars',
  options: [
    {
      type: 3, // STRING type
      name: 'userid1',
      description: 'First Discord User ID',
      required: true,
    },
    {
      type: 3, // STRING type
      name: 'userid2',
      description: 'Second Discord User ID (optional)',
      required: false,
    }
  ],
  type: 1,
  default_member_permissions: ADMIN_PERMISSIONS
};

// Simple getAllGuildRoles command
const GET_ALL_GUILD_ROLES_COMMAND = {
  name: maybePrependDev('zzgetallguildroles'),  // changed from 'getallguildroles'
  description: 'Get all role IDs in the guild',
  type: 1,
  default_member_permissions: ADMIN_PERMISSIONS
};

// Simple getroles command
const ROLES_COMMAND = {
  name: maybePrependDev('zzgetroles'),  // changed from 'getroles'
  description: 'Reece seeing if he can do stuff',
  type: 1,
  default_member_permissions: ADMIN_PERMISSIONS
};

// Command containing options
const CHALLENGE_COMMAND = {
  name: maybePrependDev('zzchallenge'),  // changed from 'challenge'
  description: 'Challenge to a match of rock paper scissors',
  options: [
    {
      type: 3,
      name: 'object',
      description: 'Pick your object',
      required: true,
      choices: createCommandChoices(),
    },
  ],
  type: 1,
  default_member_permissions: ADMIN_PERMISSIONS
};

const SET_AGE_COMMAND = {
  name: maybePrependDev('setage'),
  description: 'Set the age for a specific user',
  options: [
    {
      type: 3, // STRING type
      name: 'userid',
      description: 'Discord User ID to update',
      required: true,
    },
    {
      type: 4, // INTEGER type
      name: 'age',
      description: 'Age to set for the user',
      required: true,
    },
  ],
  type: 1,
  default_member_permissions: ADMIN_PERMISSIONS
};

const SET_TRIBE2_COMMAND = {
  name: maybePrependDev('settribe2'),
  description: 'Set up the 2nd tribe in your dynamic castlist',
  type: 1,
  options: [
    {
      name: 'role',
      description: 'Select the second tribe to be displayed on the castlist',
      type: 8, // ROLE
      required: true
    },
    {
      name: 'emoji',
      description: 'Set an optional emoji to be displayed in the tribe\'s castlist header',
      type: 3, // STRING
      required: false
    }
  ],
  default_member_permissions: ADMIN_PERMISSIONS
};

const SET_TRIBE1_COMMAND = {
  name: maybePrependDev('settribe1'),
  description: 'Set up the 1st tribe in your dynamic castlist',
  type: 1,
  options: [
    {
      name: 'role',
      description: 'Select the first tribe to be displayed on the castlist',
      type: 8, // ROLE
      required: true
    },
    {
      name: 'emoji',
      description: 'Set an optional emoji to be displayed in the tribe\'s castlist header',
      type: 3, // STRING
      required: false
    }
  ],
  default_member_permissions: ADMIN_PERMISSIONS
};

const SET_TRIBE3_COMMAND = {
  name: maybePrependDev('settribe3'),
  description: 'Set up the 3rd tribe in your dynamic castlist',
  type: 1,
  options: [
    {
      name: 'role',
      description: 'Select the third tribe to be displayed on the castlist',
      type: 8, // ROLE
      required: true
    },
    {
      name: 'emoji',
      description: 'Set an optional emoji to be displayed in the tribe\'s castlist header',
      type: 3, // STRING
      required: false
    }
  ],
  default_member_permissions: ADMIN_PERMISSIONS
};

const SET_TRIBE4_COMMAND = {
  name: maybePrependDev('settribe4'),
  description: 'Set up the 4th tribe in your dynamic castlist',
  type: 1,
  options: [
    {
      name: 'role',
      description: 'Select the fourth tribe to be displayed on the castlist',
      type: 8, // ROLE
      required: true
    },
    {
      name: 'emoji',
      description: 'Set an optional emoji to be displayed in the tribe\'s castlist header',
      type: 3, // STRING
      required: false
    }
  ],
  default_member_permissions: ADMIN_PERMISSIONS
};

const CASTLIST_COMMAND = {
  name: maybePrependDev('castlist'),
  description: 'Display the dynamic castlist',
  type: 1,
};

const CHECKDATA_COMMAND = {
  name: maybePrependDev('checkdata'),
  description: 'Check stored player data',
  type: 1,
  default_member_permissions: ADMIN_PERMISSIONS
};

const CLEAR_EMOJI_COMMAND = {
  name: maybePrependDev('clearemoji'),
  description: 'Clear saved emojis and delete them from the guild',
  type: 1,
  default_member_permissions: ADMIN_PERMISSIONS
};

const CLEAR_TRIBE1_COMMAND = {
  name: maybePrependDev('cleartribe1'),
  description: 'Clear tribe1, remove associated players and emojis',
  type: 1,
  default_member_permissions: ADMIN_PERMISSIONS
};

const CLEAR_TRIBE2_COMMAND = {
  name: maybePrependDev('cleartribe2'),
  description: 'Clear tribe2, remove associated players and emojis',
  type: 1,
  default_member_permissions: ADMIN_PERMISSIONS
};

const CLEAR_TRIBE3_COMMAND = {
  name: maybePrependDev('cleartribe3'),
  description: 'Clear tribe3, remove associated players and emojis',
  type: 1,
  default_member_permissions: ADMIN_PERMISSIONS
};

const CLEAR_TRIBE4_COMMAND = {
  name: maybePrependDev('cleartribe4'),
  description: 'Clear tribe4, remove associated players and emojis',
  type: 1,
  default_member_permissions: ADMIN_PERMISSIONS
};

const CLEAR_TRIBEALL_COMMAND = {
  name: maybePrependDev('cleartribeall'),
  description: 'Clear all tribes and remove associated players and emojis',
  type: 1,
  default_member_permissions: ADMIN_PERMISSIONS
};

const SET_AGE_ALL_COMMAND = {
  name: maybePrependDev('setageall'),
  description: 'Set ages for up to 12 players at a time',
  options: [
    {
      type: 6, // USER type
      name: 'player1',
      description: 'Discord user for player 1',
      required: true,
    },
    {
      type: 3, // STRING type
      name: 'player1_age',
      description: 'Age for player 1',
      required: true,
    },
    // Repeat for up to 12 players
    ...Array.from({ length: 11 }, (_, i) => [
      {
        type: 6,
        name: `player${i + 2}`,
        description: `Discord user for player ${i + 2}`,
        required: false,
      },
      {
        type: 3,
        name: `player${i + 2}_age`,
        description: `Age for player ${i + 2}`,
        required: false,
      },
    ]).flat(),
  ],
  default_member_permissions: ADMIN_PERMISSIONS
};

const UTIL_DELETE_SERVER_EMOJI_COMMAND = {
  name: maybePrependDev('util_deleteserveremoji'),
  description: 'Delete an emoji from the server by its ID',
  options: [
    {
      type: 3, // STRING type
      name: 'emojiid',
      description: 'The ID of the emoji to delete',
      required: true,
    }
  ],
  type: 1,
  default_member_permissions: ADMIN_PERMISSIONS
};

const UTIL_DELETE_PLAYER_EMOJI_COMMAND = {
  name: maybePrependDev('util_deleteplayeremoji'),
  description: 'Delete a player\'s emoji and their entry from playerData.json',
  options: [
    {
      type: 6, // USER type
      name: 'user',
      description: 'Select the user',
      required: true,
    }
  ],
  type: 1,
  default_member_permissions: ADMIN_PERMISSIONS
};

const ALL_COMMANDS = [
  TEST_COMMAND,
  GET_ALL_GUILD_ROLES_COMMAND,
  CHALLENGE_COMMAND,
  ROLES_COMMAND,
  SET_AGE_COMMAND,
  SET_TRIBE1_COMMAND,
  SET_TRIBE2_COMMAND,
  SET_TRIBE3_COMMAND,
  SET_TRIBE4_COMMAND,
  CASTLIST_COMMAND,
  CHECKDATA_COMMAND,
];

ALL_COMMANDS.push(
  CLEAR_EMOJI_COMMAND,
  CLEAR_TRIBE1_COMMAND,
  CLEAR_TRIBE2_COMMAND,
  CLEAR_TRIBE3_COMMAND,
  CLEAR_TRIBE4_COMMAND,
  CLEAR_TRIBEALL_COMMAND,
  SET_AGE_ALL_COMMAND,
  UTIL_DELETE_SERVER_EMOJI_COMMAND,
  UTIL_DELETE_PLAYER_EMOJI_COMMAND
);

console.log('Registering commands with:');
console.log('APP_ID:', process.env.APP_ID);
console.log('guildId:', guildId);

InstallGlobalCommands(process.env.APP_ID, ALL_COMMANDS, guildId);
