'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Store } = require('../src/store');

function tempFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whip-'));
  return path.join(dir, 'db.json');
}

test('movie requests persist and dedupe case-insensitively', () => {
  const file = tempFile();
  const store = new Store(file);
  assert.equal(store.addMovieRequest({ title: 'Inception', userId: 'U1', userName: 'a' }).added, true);
  assert.equal(store.addMovieRequest({ title: '  inception ', userId: 'U2', userName: 'b' }).added, false);

  const reloaded = new Store(file);
  assert.equal(reloaded.listMovieRequests().length, 1);
  assert.equal(reloaded.listMovieRequests()[0].title, 'Inception');
});

test('join requests can be resolved only once', () => {
  const store = new Store(tempFile());
  const req = store.addJoinRequest({ userId: 'U1', userName: 'a' });
  assert.equal(req.status, 'pending');
  assert.equal(store.resolveJoinRequest(req.id, 'approved').status, 'approved');
  assert.equal(store.resolveJoinRequest(req.id, 'declined'), null);
  assert.equal(store.getJoinRequest(req.id).status, 'approved');
});
