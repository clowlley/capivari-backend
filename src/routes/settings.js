const router = require('express').Router();
const db = require('../db/index');
const authenticate = require('../middleware/authenticate');
const upload = require('../middleware/upload');

// Público — ler uma configuração
router.get('/:key', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT value FROM site_settings WHERE key=$1', [req.params.key]);
    res.json({ value: rows[0]?.value || null });
  } catch (error) {
    console.error('Erro ao ler configuração:', error);
    res.status(500).json({ error: 'Erro interno.' });
  }
});

// Admin — salvar configuração (com upload opcional de vídeo)
router.put('/admin/:key', authenticate, upload.single('video_file'), async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    const fileUrl = req.file ? `/uploads/${req.file.filename}` : null;
    const finalValue = fileUrl || value || null;

    await db.query(
      `INSERT INTO site_settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [key, finalValue]
    );

    res.json({ value: finalValue });
  } catch (error) {
    console.error('Erro ao salvar configuração:', error);
    res.status(500).json({ error: 'Erro interno.' });
  }
});

module.exports = router;
