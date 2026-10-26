'use strict';

const { App } = require('@slack/bolt');
const { loadConfig } = require('./config');
const { Store } = require('./store');
const handlers = require('./handlers');

const config = loadConfig();
const store = new Store(config.dataFile);

const app = new App({
  token: config.botToken,
  appToken: config.appToken,
  signingSecret: config.signingSecret,
  socketMode: true,
});

app.command('/joinprvt', async ({ command, ack, client, respond }) => {
  await ack();
  try {
    const result = await handlers.handleJoinPrivate({ command, client, config, store });
    await respond({ response_type: 'ephemeral', text: result.text });
  } catch (err) {
    console.error('/joinprvt failed:', err);
    await respond({ response_type: 'ephemeral', text: 'Something went wrong sending your request. Please try again.' });
  }
});

app.action(handlers.ACTION_APPROVE, async (args) => handleDecision(args));
app.action(handlers.ACTION_DECLINE, async (args) => handleDecision(args));

async function handleDecision({ ack, action, body, client, respond }) {
  await ack();
  try {
    const result = await handlers.handleJoinPrivateDecision({ action, body, client, config, store });
    if (result.ephemeral) {
      await respond({ response_type: 'ephemeral', text: result.ephemeral });
      return;
    }
    await respond({ replace_original: true, text: result.text });
  } catch (err) {
    console.error('join decision failed:', err);
    await respond({ response_type: 'ephemeral', text: `Failed to process request: ${err.message}` });
  }
}

app.command('/join', async ({ command, ack, client, respond }) => {
  await ack();
  try {
    const result = await handlers.handleJoinPublic({ command, client, config });
    await respond({ response_type: 'ephemeral', text: result.text });
  } catch (err) {
    console.error('/join failed:', err);
    await respond({ response_type: 'ephemeral', text: `Couldn't add you to the channel: ${err.data?.error || err.message}` });
  }
});

app.command('/movierequest', async ({ command, ack, client, respond }) => {
  await ack();
  try {
    const result = await handlers.handleMovieRequest({ command, client, config, store });
    await respond({ response_type: 'ephemeral', text: result.text });
  } catch (err) {
    console.error('/movierequest failed:', err);
    await respond({ response_type: 'ephemeral', text: 'Something went wrong saving your movie request.' });
  }
});

(async () => {
  await app.start();
  console.log('⚡️ whip Slack bot is running (Socket Mode)');
})();
