const express = require('express');
const router = express.Router();
const store = require('../services/keyStore');

router.post('/api/verify-key', (req, res) => {
  const { key } = req.body;
  if (!key) return res.status(400).json({ error: 'Llave requerida' });

  const record = store.findByKey(key.trim());

  if (!record) {
    return res.status(401).json({ error: 'Invalid or revoked license key.' });
  }

  // Registra el uso e inicia el tiempo de expiración si es su primer uso
  store.touch(record);

  res.json({ 
    success: true, 
    duration: record.duration,
    key: record.key 
  });
});

module.exports = router;