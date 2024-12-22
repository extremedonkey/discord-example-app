import 'dotenv/config';
import { getRPSChoices } from './game.js';
import { capitalize, InstallGlobalCommands } from './utils.js';

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

// Simple test command
const TEST_COMMAND = {
  name: 'playericons',
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
};

// Simple getAllGuildRoles command
const GET_ALL_GUILD_ROLES_COMMAND = {
  name: 'zzgetallguildroles',  // changed from 'getallguildroles'
  description: 'Get all role IDs in the guild',
  type: 1,
};

// Simple getroles command
const ROLES_COMMAND = {
  name: 'zzgetroles',  // changed from 'getroles'
  description: 'Reece seeing if he can do stuff',
  type: 1,
};

// Command containing options
const CHALLENGE_COMMAND = {
  name: 'zzchallenge',  // changed from 'challenge'
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
};

const SET_AGE_COMMAND = {
  name: 'setage',
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
};

const CASTLIST_COMMAND = {
  name: 'castlist',
  description: 'Display the dynamic castlist',
  type: 1,
};

const CHECKDATA_COMMAND = {
  name: 'checkdata',
  description: 'Check stored player data',
  type: 1,
};

const ALL_COMMANDS = [
  TEST_COMMAND,
  GET_ALL_GUILD_ROLES_COMMAND,
  CHALLENGE_COMMAND,
  ROLES_COMMAND,
  SET_AGE_COMMAND,
  CASTLIST_COMMAND,
  CHECKDATA_COMMAND,
];

InstallGlobalCommands(process.env.APP_ID, ALL_COMMANDS);
