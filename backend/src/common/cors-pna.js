const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000')
  .split(',')
  .map((s) => (s || '').trim())
  .filter(Boolean);

function isOriginAllowed(origin) {
  if (!origin) return false;
  if (origin === 'null') return process.env.ALLOW_NULL_ORIGIN === '1';
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  try {
    const u = new URL(origin);
    if (u.hostname === '970524.xyz' || u.hostname.endsWith('.970524.xyz')) return true;
  } catch (_) {}
  return false;
}

function corsPnaMiddleware(req, res, next) {
  const origin = req.headers.origin || '';
  const originAllowed = isOriginAllowed(origin);
  if (originAllowed) {
    try {
      res.setHeader('Access-Control-Allow-Origin', origin);
    } catch (_) {}
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Access-Control-Request-Private-Network');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');

  const acrpnRaw = req.headers['access-control-request-private-network'];
  const acrpnPresent = typeof acrpnRaw !== 'undefined' && acrpnRaw !== null && acrpnRaw !== '';
  if (acrpnPresent) {
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
  }

  if (req.method === 'OPTIONS') {
    if (origin && !originAllowed) return res.status(403).end();
    res.setHeader('Access-Control-Max-Age', '600');
    return res.status(204).end();
  }

  if (acrpnPresent) {
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
  }

  if (origin && !originAllowed) return res.status(403).json({ code: 403, msg: 'Origin not allowed' });
  return next();
}

module.exports = {
  ALLOWED_ORIGINS,
  isOriginAllowed,
  corsPnaMiddleware,
};
