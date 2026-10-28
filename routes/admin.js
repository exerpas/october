const express = require('express');
const store = require('../services/keyStore');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.use(requireAdmin);

router.get('/keys', (req, res) => {
  res.json({ keys: store.list() });
});

router.post('/keys', (req, res) => {
  const label = typeof req.body?.label === 'string' ? req.body.label.trim() : '';
  const duration = req.body?.duration || '1';
  const maxUses = req.body?.maxUses || 1;
  
  const newKey = store.create(label, duration, maxUses);
  res.status(201).json({ key: newKey });
});

router.patch('/keys/:id', (req, res) => {
  const { status } = req.body || {};
  if (!['active', 'revoked'].includes(status)) {
    return res.status(400).json({ error: 'Status debe ser active o revoked' });
  }
  const record = store.setStatus(req.params.id, status);
  if (!record) return res.status(404).json({ error: 'Key no encontrada' });
  res.json({ key: record });
});

router.delete('/keys/:id', (req, res) => {
  if (!store.remove(req.params.id)) return res.status(404).json({ error: 'Key no encontrada' });
  res.json({ ok: true });
});

module.exports = router;