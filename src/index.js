'use strict';

const { App } = require('@slack/bolt');
const { loadConfig } = require('./config');
const { Store } = require('./store');
const { createAiClient } = require('./ai');
const { Chatbot } = require('./chatbot');
const handlers = require('./handlers');

const config = loadConfig();
const store = new Store(config.dataFile);
const chatbot = new Chatbot(
  createAiClient({ apiKey: config.anthropicApiKey, model: config.anthropicModel })
);

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

app.command('/joinc', async ({ command, ack, client, respond }) => {
  await ack();
  try {
    const result = await handlers.handleJoinPublic({ command, client, config });
    await respond({ response_type: 'ephemeral', text: result.text });
  } catch (err) {
    console.error('/joinc failed:', err);
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

app.command('/ask', async ({ command, ack, respond }) => {
  await ack();
  try {
    const result = await handlers.handleAsk({ command, chatbot });
    await respond({ response_type: 'ephemeral', text: result.text });
  } catch (err) {
    console.error('/ask failed:', err);
    await respond({ response_type: 'ephemeral', text: 'The chatbot is unavailable right now. Please try again in a moment.' });
  }
});

/** Shared path for @mentions and DMs: reply in a thread, keeping per-thread history. */
async function answerInThread({ client, channel, thread_ts, text }) {
  const cleaned = handlers.stripMentions(text);
  const key = `thread:${channel}:${thread_ts}`;
  try {
    const reply = await chatbot.respond(key, cleaned);
    await client.chat.postMessage({ channel, thread_ts, text: reply });
  } catch (err) {
    console.error('chatbot reply failed:', err);
    await client.chat.postMessage({
      channel,
      thread_ts,
      text: 'The chatbot is unavailable right now. Please try again in a moment.',
    });
  }
}

app.event('app_mention', async ({ event, client }) => {
  await answerInThread({
    client,
    channel: event.channel,
    thread_ts: event.thread_ts || event.ts,
    text: event.text,
  });
});

app.event('message', async ({ event, client }) => {
  // Only human DMs. Skip bot messages, edits, deletions, and other subtypes.
  if (event.channel_type !== 'im' || event.subtype || event.bot_id) return;
  await answerInThread({
    client,
    channel: event.channel,
    thread_ts: event.thread_ts || event.ts,
    text: event.text,
  });
});

(async () => {
  await app.start();
  console.log('whip Slack bot is running (Socket Mode)');
})();
