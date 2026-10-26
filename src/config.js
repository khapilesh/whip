'use strict';

require('dotenv').config();

function required(env, name) {
  const value = env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function loadConfig(env = process.env) {
  return {
    botToken: required(env, 'SLACK_BOT_TOKEN'),
    appToken: required(env, 'SLACK_APP_TOKEN'),
    signingSecret: env.SLACK_SIGNING_SECRET || undefined,
    ownerUserId: required(env, 'OWNER_USER_ID'),
    publicChannelId: required(env, 'PUBLIC_CHANNEL_ID'),
    privateChannelId: env.PRIVATE_CHANNEL_ID || undefined,
    dataFile: env.DATA_FILE || 'data/db.json',
  };
}

module.exports = { loadConfig };
