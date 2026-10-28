const crypto = require('crypto');
const store = require('../services/keyStore');

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    try {
      out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      /* cookie malformada: se ignora */
    }
  }
  return out;
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/** Valida que la Key del usuario exista y esté activa (cookie o header x-license-key). */
function requireLicense({ redirect = false } = {}) {
  return (req, res, next) => {
    const provided = req.headers['x-license-key'] || parseCookies(req.headers.cookie).license_key;
    const record = provided && store.findByKey(provided);

    if (record && record.status === 'active') {
      req.license = record;
      store.touch(record);
      return next();
    }
    if (redirect) return res.redirect('/');
    return res.status(401).json({ error: 'Licencia inválida o revocada' });
  };
}

/** Protege la API de administración con la contraseña maestra (ADMIN_KEY). */
const failures = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;

function requireAdmin(req, res, next) {
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey) {
    return res.status(503).json({ error: 'ADMIN_KEY no está configurada en el servidor' });
  }

  const now = Date.now();
  let entry = failures.get(req.ip);
  if (entry && entry.reset < now) {
    failures.delete(req.ip);
    entry = null;
  }
  if (entry && entry.count >= MAX_FAILURES) {
    return res.status(429).json({ error: 'Demasiados intentos fallidos. Espera unos minutos.' });
  }

  if (safeEqual(req.headers['x-admin-key'] || '', adminKey)) return next();

  if (!entry) {
    entry = { count: 0, reset: now + WINDOW_MS };
    failures.set(req.ip, entry);
  }
  entry.count++;
  return res.status(401).json({ error: 'Contraseña maestra incorrecta' });
}

module.exports = { requireLicense, requireAdmin };
