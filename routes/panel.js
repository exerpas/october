const crypto = require('crypto');
const express = require('express');
const { requireLicense } = require('../middleware/auth');

const router = express.Router();
router.use(requireLicense());

function cleanString(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

router.post('/submit', (req, res) => {
  const body = req.body || {};
  const credential = cleanString(body.credential, 500);
  const resourceId = cleanString(body.resourceId, 100);
  const channel = cleanString(body.channel, 100);
  const webhookUrl = cleanString(body.webhookUrl, 500);

  const errors = [];
  if (!credential) errors.push('La credencial es obligatoria');
  if (!resourceId) errors.push('El ID de recurso es obligatorio');
  if (!channel) errors.push('El canal es obligatorio');

  if (webhookUrl) {
    try {
      if (new URL(webhookUrl).protocol !== 'https:') errors.push('El Webhook URL debe usar https');
    } catch {
      errors.push('El Webhook URL no es una URL válida');
    }
  }

  // Filtros
  const f = body.filters || {};
  const filters = {
    mode: ['none', 'include', 'exclude'].includes(f.mode) ? f.mode : 'none',
    keywords: (typeof f.keywords === 'string' ? f.keywords : '')
      .split(',')
      .map((k) => k.trim().slice(0, 100))
      .filter(Boolean)
      .slice(0, 50),
    onlyActive: Boolean(f.onlyActive),
    maxItems: Math.min(Math.max(parseInt(f.maxItems, 10) || 100, 1), 1000),
  };

  if (errors.length) return res.status(400).json({ error: errors.join('. ') });

  // ------------------------------------------------------------------
  // TODO: aquí va tu lógica de negocio con los datos validados.
  // Recomendaciones:
  //  - No guardes ni imprimas `credential` en logs.
  //  - Si vas a hacer una petición al webhookUrl desde el servidor, valida el host
  //    (bloquea IPs privadas/localhost) para evitar SSRF.
  // ------------------------------------------------------------------
  const jobId = crypto.randomUUID();

  res.json({
    ok: true,
    jobId,
    licenseId: req.license.id,
    received: {
      credential: '••••' + credential.slice(-4),
      resourceId,
      channel,
      webhookUrl: webhookUrl || null,
      filters,
    },
  });
});

module.exports = router;
