const crypto = require('crypto');

const RAW_AUTH_TOKEN_SECRET = (process.env.AUTH_TOKEN_SECRET || '').trim();
const ALLOW_INSECURE_AUTH_TOKEN_SECRET = process.env.ALLOW_INSECURE_AUTH_TOKEN_SECRET === '1';
if (!RAW_AUTH_TOKEN_SECRET && !ALLOW_INSECURE_AUTH_TOKEN_SECRET) {
  throw new Error('AUTH_TOKEN_SECRET is required. Set AUTH_TOKEN_SECRET, or set ALLOW_INSECURE_AUTH_TOKEN_SECRET=1 for local dev only.');
}

const AUTH_TOKEN_SECRET = RAW_AUTH_TOKEN_SECRET || 'dev-insecure-auth-secret';
const AUTH_TOKEN_TTL_SEC = Number(process.env.AUTH_TOKEN_TTL_SEC || 60 * 60 * 24 * 7);

function toBase64Url(input) {
  return Buffer.from(input, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(input) {
  const normalized = (input || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '==='.slice((normalized.length + 3) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
}

function createAuthToken(username) {
  const nowSec = Math.floor(Date.now() / 1000);
  const payload = {
    u: username,
    iat: nowSec,
    exp: nowSec + AUTH_TOKEN_TTL_SEC,
  };
  const payloadPart = toBase64Url(JSON.stringify(payload));
  const sigPart = crypto.createHmac('sha256', AUTH_TOKEN_SECRET).update(payloadPart).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  return payloadPart + '.' + sigPart;
}

function verifyAuthToken(token) {
  try {
    const parts = (token || '').split('.');
    if (parts.length !== 2) return null;
    const payloadPart = parts[0];
    const sigPart = parts[1];
    const expected = crypto.createHmac('sha256', AUTH_TOKEN_SECRET).update(payloadPart).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    if (sigPart !== expected) return null;
    const payload = JSON.parse(fromBase64Url(payloadPart));
    const nowSec = Math.floor(Date.now() / 1000);
    if (!payload || !payload.u || !payload.exp || nowSec >= Number(payload.exp)) return null;
    return payload;
  } catch (_) {
    return null;
  }
}

module.exports = {
  createAuthToken,
  verifyAuthToken,
};
