'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const handlers = require('../src/handlers');
const { Store } = require('../src/store');

const config = {
  ownerUserId: 'UOWNER',
  publicChannelId: 'CPUBLIC',
  privateChannelId: 'GPRIVATE',
};

function makeStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whip-h-'));
  return new Store(path.join(dir, 'db.json'));
}

function fakeClient({ inviteError } = {}) {
  const calls = { posted: [], invited: [] };
  return {
    calls,
    chat: {
      postMessage: async (args) => {
        calls.posted.push(args);
        return { ok: true };
      },
    },
    conversations: {
      invite: async (args) => {
        if (inviteError) throw inviteError;
        calls.invited.push(args);
        return { ok: true };
      },
    },
  };
}

const cmd = (userId, text = '') => ({ user_id: userId, user_name: `name-${userId}`, text });

test('/joinprvt notifies the owner with Accept/Decline buttons', async () => {
  const client = fakeClient();
  const store = makeStore();
  const result = await handlers.handleJoinPrivate({ command: cmd('UFRIEND'), client, config, store });

  assert.match(result.text, /sent to the owner/);
  assert.equal(client.calls.posted.length, 1);
  const msg = client.calls.posted[0];
  assert.equal(msg.channel, 'UOWNER');
  const buttons = msg.blocks[1].elements;
  assert.deepEqual(buttons.map((b) => b.action_id), [handlers.ACTION_APPROVE, handlers.ACTION_DECLINE]);
  assert.equal(store.getJoinRequest(buttons[0].value).userId, 'UFRIEND');
});

test('owner accepting a /joinprvt request invites the user to the private channel', async () => {
  const client = fakeClient();
  const store = makeStore();
  const req = store.addJoinRequest({ userId: 'UFRIEND', userName: 'friend' });

  const result = await handlers.handleJoinPrivateDecision({
    action: { action_id: handlers.ACTION_APPROVE, value: req.id },
    body: { user: { id: 'UOWNER' } },
    client, config, store,
  });

  assert.match(result.text, /Accepted/);
  assert.deepEqual(client.calls.invited, [{ channel: 'GPRIVATE', users: 'UFRIEND' }]);
  assert.equal(store.getJoinRequest(req.id).status, 'approved');
});

test('declining does not invite the user', async () => {
  const client = fakeClient();
  const store = makeStore();
  const req = store.addJoinRequest({ userId: 'UFRIEND', userName: 'friend' });

  const result = await handlers.handleJoinPrivateDecision({
    action: { action_id: handlers.ACTION_DECLINE, value: req.id },
    body: { user: { id: 'UOWNER' } },
    client, config, store,
  });

  assert.match(result.text, /Declined/);
  assert.equal(client.calls.invited.length, 0);
  assert.equal(store.getJoinRequest(req.id).status, 'declined');
});

test('non-owner cannot accept or decline requests', async () => {
  const client = fakeClient();
  const store = makeStore();
  const req = store.addJoinRequest({ userId: 'UFRIEND', userName: 'friend' });

  const result = await handlers.handleJoinPrivateDecision({
    action: { action_id: handlers.ACTION_APPROVE, value: req.id },
    body: { user: { id: 'USOMEONE' } },
    client, config, store,
  });

  assert.match(result.ephemeral, /Only the owner/);
  assert.equal(client.calls.invited.length, 0);
  assert.equal(store.getJoinRequest(req.id).status, 'pending');
});

test('/joinc adds the user to the public channel', async () => {
  const client = fakeClient();
  const result = await handlers.handleJoinPublic({ command: cmd('UFRIEND'), client, config });
  assert.match(result.text, /added to the public channel/);
  assert.deepEqual(client.calls.invited, [{ channel: 'CPUBLIC', users: 'UFRIEND' }]);
});

test('/joinc is friendly when the user is already in the channel', async () => {
  const client = fakeClient({ inviteError: Object.assign(new Error('already'), { data: { error: 'already_in_channel' } }) });
  const result = await handlers.handleJoinPublic({ command: cmd('UFRIEND'), client, config });
  assert.match(result.text, /already in the public channel/);
});

test('/joinc rethrows unexpected Slack errors', async () => {
  const client = fakeClient({ inviteError: Object.assign(new Error('nope'), { data: { error: 'channel_not_found' } }) });
  await assert.rejects(handlers.handleJoinPublic({ command: cmd('UFRIEND'), client, config }), /nope/);
});

test('/movierequest adds a movie, rejects duplicates, and lists requests', async () => {
  const store = makeStore();
  const add = await handlers.handleMovieRequest({ command: cmd('U1', 'The Matrix'), store });
  assert.match(add.text, /Added "The Matrix"/);

  const dup = await handlers.handleMovieRequest({ command: cmd('U2', 'the matrix'), store });
  assert.match(dup.text, /already on the movie request list/);

  await handlers.handleMovieRequest({ command: cmd('U2', 'Alien'), store });
  const list = await handlers.handleMovieRequest({ command: cmd('U3', ''), store });
  assert.match(list.text, /1\. The Matrix/);
  assert.match(list.text, /2\. Alien/);
});

test('/movierequest with no movies explains how to request one', async () => {
  const result = await handlers.handleMovieRequest({ command: cmd('U1', ''), store: makeStore() });
  assert.match(result.text, /No movies have been requested yet/);
});
