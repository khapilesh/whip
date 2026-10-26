'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Tutor, SYSTEM_PROMPT } = require('../src/tutor');
const { createAiClient } = require('../src/ai');
const handlers = require('../src/handlers');

function fakeAi(replies = ['What do you think the first step is?']) {
  const calls = [];
  let i = 0;
  return {
    calls,
    complete: async (input) => {
      calls.push(input);
      return replies[Math.min(i++, replies.length - 1)];
    },
  };
}

test('tutor sends the Socratic system prompt and the user message', async () => {
  const ai = fakeAi();
  const tutor = new Tutor(ai);
  const reply = await tutor.respond('k1', '  what is 2+2*3?  ');
  assert.equal(reply, 'What do you think the first step is?');
  assert.equal(ai.calls[0].system, SYSTEM_PROMPT);
  assert.deepEqual(ai.calls[0].messages, [{ role: 'user', content: 'what is 2+2*3?' }]);
  assert.match(SYSTEM_PROMPT, /Do NOT give the final answer/);
});

test('tutor keeps history per conversation and trims it', async () => {
  const ai = fakeAi(['r1', 'r2', 'r3']);
  const tutor = new Tutor(ai, { maxHistory: 4 });
  await tutor.respond('k', 'a');
  await tutor.respond('k', 'b');
  await tutor.respond('k', 'c');
  const last = ai.calls[2].messages;
  assert.deepEqual(last.map((m) => m.content), ['a', 'r1', 'b', 'r2', 'c']);

  await tutor.respond('other', 'x');
  assert.equal(ai.calls[3].messages.length, 1);
});

test('tutor asks for a question instead of calling the AI on empty input', async () => {
  const ai = fakeAi();
  const reply = await new Tutor(ai).respond('k', '   ');
  assert.match(reply, /Ask me something/);
  assert.equal(ai.calls.length, 0);
});

test('/ask shows usage when empty and forwards questions to the tutor', async () => {
  const ai = fakeAi(['Good question. What have you tried?']);
  const tutor = new Tutor(ai);
  const empty = await handlers.handleAsk({ command: { text: '', channel_id: 'C1', user_id: 'U1' }, tutor });
  assert.match(empty.text, /Usage/);

  const res = await handlers.handleAsk({ command: { text: 'how do I reverse a list?', channel_id: 'C1', user_id: 'U1' }, tutor });
  assert.equal(res.text, 'Good question. What have you tried?');
});

test('stripMentions removes Slack user mentions', () => {
  assert.equal(handlers.stripMentions('<@U123ABC> help me with fractions'), 'help me with fractions');
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
