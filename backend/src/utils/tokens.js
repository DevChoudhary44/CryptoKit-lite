'use strict';
const crypto = require('crypto');

// raw goes in the email link; only the hash is stored in the database.
function createToken() {
  const raw = crypto.randomBytes(32).toString('hex');
  return { raw, hash: hashToken(raw) };
}
function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}
const isValidToken = (t) => typeof t === 'string' && /^[a-f0-9]{64}$/.test(t);

module.exports = { createToken, hashToken, isValidToken };
