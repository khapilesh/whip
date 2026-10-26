'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Tiny JSON-file store for join requests and movie requests.
 * Writes are atomic (write temp file, then rename) so a crash can't corrupt data.
 */
class Store {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = { joinRequests: [], movieRequests: [] };
    this._load();
  }

  _load() {
    if (!fs.existsSync(this.filePath)) return;
    const raw = fs.readFileSync(this.filePath, 'utf8').trim();
    if (!raw) return;
    const parsed = JSON.parse(raw);
    this.data = {
      joinRequests: parsed.joinRequests || [],
      movieRequests: parsed.movieRequests || [],
    };
  }

  _save() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.filePath);
  }

  // ---- Private channel join requests (/joinprvt) ----

  addJoinRequest({ userId, userName }) {
    const request = {
      id: crypto.randomBytes(6).toString('hex'),
      userId,
      userName,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    this.data.joinRequests.push(request);
    this._save();
    return request;
  }

  getJoinRequest(id) {
    return this.data.joinRequests.find((r) => r.id === id) || null;
  }

  resolveJoinRequest(id, status) {
    const request = this.getJoinRequest(id);
    if (!request || request.status !== 'pending') return null;
    request.status = status;
    request.resolvedAt = new Date().toISOString();
    this._save();
    return request;
  }

  // ---- Movie requests (/movierequest) ----

  /** Returns { added: boolean, request } — duplicates (case-insensitive) are not re-added. */
  addMovieRequest({ title, userId, userName }) {
    const normalized = title.trim().toLowerCase();
    const existing = this.data.movieRequests.find(
      (m) => m.title.trim().toLowerCase() === normalized
    );
    if (existing) return { added: false, request: existing };

    const request = {
      id: crypto.randomBytes(6).toString('hex'),
      title: title.trim(),
      userId,
      userName,
      createdAt: new Date().toISOString(),
    };
    this.data.movieRequests.push(request);
    this._save();
    return { added: true, request };
  }

  listMovieRequests() {
    return [...this.data.movieRequests];
  }
}

module.exports = { Store };
