function rateLimit({ windowMs = 15 * 60 * 1000, max = 10, message = 'Demasiados intentos, inténtalo más tarde' } = {}) {
  const hits = new Map();

  setInterval(() => {
    const now = Date.now();
    for (const [ip, e] of hits) if (e.reset < now) hits.delete(ip);
  }, windowMs).unref();

  return (req, res, next) => {
    const now = Date.now();
    let entry = hits.get(req.ip);
    if (!entry || entry.reset < now) {
      entry = { count: 0, reset: now + windowMs };
      hits.set(req.ip, entry);
    }
    entry.count++;
    if (entry.count > max) {
      res.set('Retry-After', Math.ceil((entry.reset - now) / 1000));
      return res.status(429).json({ error: message });
    }
    next();
  };
}

module.exports = rateLimit;
