const env = require('../config/env');
const loginAttemptsByIp = new Map();

function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (env.TRUST_PROXY && typeof xff === 'string' && xff.length > 0) {
    return xff.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

function canAttemptLogin(req) {
  const ip = getClientIp(req);
  const now = Date.now();
  const entry = loginAttemptsByIp.get(ip);

  if (entry?.bannedUntil && now < entry.bannedUntil) {
    return { allowed: false, retryAfterMs: entry.bannedUntil - now };
  }

  if (!entry) {
    loginAttemptsByIp.set(ip, { count: 1, firstAt: now, bannedUntil: 0 });
    return { allowed: true };
  }

  const inWindow = now - entry.firstAt < env.LOGIN_RATE_WINDOW_MS;
  if (!inWindow) {
    loginAttemptsByIp.set(ip, { count: 1, firstAt: now, bannedUntil: 0 });
    return { allowed: true };
  }

  if (entry.count >= env.LOGIN_RATE_MAX_ATTEMPTS) {
    entry.bannedUntil = now + env.LOGIN_BAN_MS;
    entry.count = 0;
    entry.firstAt = now;
    loginAttemptsByIp.set(ip, entry);
    return { allowed: false, retryAfterMs: env.LOGIN_BAN_MS };
  }

  entry.count += 1;
  loginAttemptsByIp.set(ip, entry);
  return { allowed: true };
}

function resetAttempts(req) {
  loginAttemptsByIp.delete(getClientIp(req));
}

// Limpeza periódica para evitar memory leak
setInterval(() => {
  const now = Date.now();
  const maxAge = Math.max(env.LOGIN_RATE_WINDOW_MS, env.LOGIN_BAN_MS) * 2;
  for (const [ip, entry] of loginAttemptsByIp.entries()) {
    const expired = now - entry.firstAt > maxAge;
    const banExpired = !entry.bannedUntil || now > entry.bannedUntil;
    if (expired && banExpired) loginAttemptsByIp.delete(ip);
  }
}, 10 * 60 * 1000).unref();

const rateLimiter = (req, res, next) => {
  const { allowed, retryAfterMs } = canAttemptLogin(req);
  if (!allowed) return res.status(429).json({ error: 'Muitas tentativas.', retryAfterMs });
  next();
};

rateLimiter.resetAttempts = resetAttempts;
module.exports = rateLimiter;