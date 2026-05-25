const router = require('express').Router();
const db = require('../db/index');
const authenticate = require('../middleware/authenticate');
const upload = require('../middleware/upload');

// Público
router.get('/', async (req, res) => {
  try {
    const limit = Number(req.query.limit || 12);
    const { rows } = await db.query(
      `SELECT * FROM products WHERE status = 'published' ORDER BY featured DESC, created_at DESC LIMIT $1`,
      [limit]
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar produtos.' });
  }
});

router.get('/id/:id', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM products WHERE id = $1 AND status = 'published'`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Produto não encontrado.' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar produto.' });
  }
});

// Admin
router.get('/admin', authenticate, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM products ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar produtos.' });
  }
});

router.post('/admin', authenticate, upload.single('cover_image_file'), async (req, res) => {
  try {
    const { title, description, full_content, cover_image, category, price, stock, status, featured, whatsapp } = req.body;
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : (cover_image || null);
    const { rows } = await db.query(
      `INSERT INTO products (title, description, full_content, cover_image, category, price, stock, status, featured, whatsapp)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [title, description, full_content || null, imageUrl, category || null,
       parseFloat(price) || 0, parseInt(stock) || 0, status || 'draft', !!featured, whatsapp || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao criar produto.' });
  }
});

router.put('/admin/:id', authenticate, upload.single('cover_image_file'), async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, full_content, cover_image, category, price, stock, status, featured, whatsapp } = req.body;
    let imageUrl = cover_image || null;
    if (req.file) {
      imageUrl = `/uploads/${req.file.filename}`;
    } else if (!imageUrl) {
      const ex = await db.query('SELECT cover_image FROM products WHERE id=$1', [id]);
      imageUrl = ex.rows[0]?.cover_image || null;
    }
    const { rows } = await db.query(
      `UPDATE products SET title=$1, description=$2, full_content=$3, cover_image=$4, category=$5,
       price=$6, stock=$7, status=$8, featured=$9, whatsapp=$10, updated_at=NOW()
       WHERE id=$11 RETURNING *`,
      [title, description, full_content || null, imageUrl, category || null,
       parseFloat(price) || 0, parseInt(stock) || 0, status || 'draft', !!featured, whatsapp || null, id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Produto não encontrado.' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar produto.' });
  }
});

router.delete('/admin/:id', authenticate, async (req, res) => {
  try {
    await db.query('DELETE FROM products WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: 'Erro ao excluir produto.' });
  }
});

module.exports = router;
