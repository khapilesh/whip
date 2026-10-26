'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Chatbot, buildSystemPrompt, parseReply, rudenessLevel, TONE_LEVELS } = require('../src/chatbot');
const { createAiClient } = require('../src/ai');
const handlers = require('../src/handlers');

function fakeAi(raws = ['{"reply": "hi", "wrong_answer": false}']) {
  const calls = [];
  let i = 0;
  return {
    calls,
    complete: async (input) => {
      calls.push(input);
      return raws[Math.min(i++, raws.length - 1)];
    },
  };
}

const json = (reply, wrong) => JSON.stringify({ reply, wrong_answer: wrong });

test('rudeness level escalates with wrong answers and caps at 3', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 9].map(rudenessLevel), [0, 1, 2, 2, 3, 3]);
});

test('system prompt uses the tone for the current level', () => {
  assert.match(buildSystemPrompt(0), new RegExp(TONE_LEVELS[0].slice(0, 20).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(buildSystemPrompt(3), /Very rude|very rude/);
  assert.doesNotMatch(buildSystemPrompt(0), /Socratic|hint/i);
});

test('parseReply reads JSON and falls back to plain text', () => {
  assert.deepEqual(parseReply(json('Paris.', true)), { reply: 'Paris.', wrongAnswer: true });
  assert.deepEqual(parseReply('```json\n{"reply":"ok","wrong_answer":false}\n```'), { reply: 'ok', wrongAnswer: false });
  assert.deepEqual(parseReply('just text'), { reply: 'just text', wrongAnswer: false });
});

test('chatbot returns the reply and keeps only the text in history', async () => {
  const ai = fakeAi([json('Hello!', false), json('Second', false)]);
  const bot = new Chatbot(ai);
  assert.equal(await bot.respond('k', 'hi'), 'Hello!');
  await bot.respond('k', 'and again');
  assert.deepEqual(ai.calls[1].messages.map((m) => m.content), ['hi', 'Hello!', 'and again']);
});

test('wrong answers escalate the tone on later turns', async () => {
  const ai = fakeAi([
    json('Capital of France?', false),
    json('Nope, it is Paris.', true),   // wrong answer #1
    json('Seriously?', true),           // wrong answer #2
    json('Again?', false),
  ]);
  const bot = new Chatbot(ai);
  await bot.respond('k', 'start');
  assert.equal(ai.calls[0].system, buildSystemPrompt(0));

  await bot.respond('k', 'Lyon');
  assert.equal(ai.calls[1].system, buildSystemPrompt(0)); // verdict applies from the next reply
  assert.equal(bot.status('k').wrongCount, 1);

  await bot.respond('k', 'Marseille');
  assert.equal(ai.calls[2].system, buildSystemPrompt(1));
  assert.equal(bot.status('k').wrongCount, 2);
  assert.equal(bot.status('k').level, 2);

  await bot.respond('k', 'hmm');
  assert.equal(ai.calls[3].system, buildSystemPrompt(2));
});

test('wrong-answer counts are tracked per conversation', async () => {
  const ai = fakeAi([json('a', true), json('b', false)]);
  const bot = new Chatbot(ai);
  await bot.respond('one', 'x');
  await bot.respond('two', 'y');
  assert.equal(bot.status('one').wrongCount, 1);
  assert.equal(bot.status('two').wrongCount, 0);
});

test('empty input does not call the AI', async () => {
  const ai = fakeAi();
  const reply = await new Chatbot(ai).respond('k', '   ');
  assert.match(reply, /nothing/);
  assert.equal(ai.calls.length, 0);
});

test('/ask shows usage when empty and forwards questions to the chatbot', async () => {
  const ai = fakeAi([json('Sure, the answer is 4.', false)]);
  const chatbot = new Chatbot(ai);
  const empty = await handlers.handleAsk({ command: { text: '', channel_id: 'C1', user_id: 'U1' }, chatbot });
  assert.match(empty.text, /Usage/);

  const res = await handlers.handleAsk({ command: { text: 'what is 2+2?', channel_id: 'C1', user_id: 'U1' }, chatbot });
  assert.equal(res.text, 'Sure, the answer is 4.');
});

test('stripMentions removes Slack user mentions', () => {
  assert.equal(handlers.stripMentions('<@U123ABC> what is up'), 'what is up');
});

test('AI client posts to the Messages API and returns the text', async () => {
  let captured;
  const fetchImpl = async (url, opts) => {
    captured = { url, opts, body: JSON.parse(opts.body) };
    return { ok: true, json: async () => ({ content: [{ type: 'text', text: 'Hello' }, { type: 'text', text: ' there' }] }) };
  };
  const client = createAiClient({ apiKey: 'key', model: 'm', fetchImpl });
  const out = await client.complete({ system: 'sys', messages: [{ role: 'user', content: 'hi' }] });
  assert.equal(out, 'Hello there');
  assert.equal(captured.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(captured.opts.headers['x-api-key'], 'key');
  assert.equal(captured.body.model, 'm');
  assert.equal(captured.body.system, 'sys');
});

test('AI client surfaces HTTP errors', async () => {
  const fetchImpl = async () => ({ ok: false, status: 401, text: async () => 'bad key' });
  const client = createAiClient({ apiKey: 'key', model: 'm', fetchImpl });
  await assert.rejects(client.complete({ system: 's', messages: [] }), /AI request failed \(401\)/);
});
