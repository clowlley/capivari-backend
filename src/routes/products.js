const router = require('express').Router();
const db = require('../db/index');
const authenticate = require('../middleware/authenticate');
const upload = require('../middleware/upload');
const { uploadFile } = require('../lib/cloudinary');

const MAX_PHOTOS = 50;

// Aceita qualquer fieldname; filtramos manualmente por cover_image_file e photo_files
const productUpload = upload.any();

function splitFiles(req) {
  const all = req.files || [];
  const coverFile = all.find((f) => f.fieldname === 'cover_image_file');
  const photoFiles = all.filter((f) => f.fieldname === 'photo_files').slice(0, MAX_PHOTOS);
  return { coverFile, photoFiles };
}

// SELECT com fotos agregadas em array
const SELECT_WITH_PHOTOS = `
  SELECT p.*,
         COALESCE(
           json_agg(json_build_object('id', pp.id, 'image', pp.image) ORDER BY pp.created_at)
             FILTER (WHERE pp.id IS NOT NULL),
           '[]'
         ) AS photos
  FROM products p
  LEFT JOIN product_photos pp ON pp.product_id = p.id
`;

// ── Público: listar ────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const limit = Number(req.query.limit || 12);
    const { rows } = await db.query(
      `${SELECT_WITH_PHOTOS}
       WHERE p.status = 'published'
       GROUP BY p.id
       ORDER BY p.featured DESC, p.created_at DESC
       LIMIT $1`,
      [limit]
    );
    res.json({ data: rows, total: rows.length });
  } catch {
    res.status(500).json({ error: 'Erro ao buscar produtos.' });
  }
});

// ── Público: detalhe ───────────────────────────────────────────
router.get('/id/:id', async (req, res) => {
  try {
    const { rows } = await db.query(
      `${SELECT_WITH_PHOTOS}
       WHERE p.id = $1 AND p.status = 'published'
       GROUP BY p.id`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Produto não encontrado.' });
    res.json(rows[0]);
  } catch {
    res.status(500).json({ error: 'Erro ao buscar produto.' });
  }
});

// ── Admin: listar ──────────────────────────────────────────────
router.get('/admin', authenticate, async (req, res) => {
  try {
    const { rows } = await db.query(
      `${SELECT_WITH_PHOTOS}
       GROUP BY p.id
       ORDER BY p.created_at DESC`
    );
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Erro ao buscar produtos.' });
  }
});

// ── Admin: criar ───────────────────────────────────────────────
router.post('/admin', authenticate, productUpload, async (req, res) => {
  try {
    const { title, description, full_content, cover_image, category, price, stock, status, featured, whatsapp } = req.body;
    const { coverFile, photoFiles } = splitFiles(req);

    const imageUrl = coverFile ? await uploadFile(coverFile) : (cover_image || null);

    const { rows } = await db.query(
      `INSERT INTO products (title, description, full_content, cover_image, category, price, stock, status, featured, whatsapp)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [title, description, full_content || null, imageUrl, category || null,
       parseFloat(price) || 0, parseInt(stock) || 0, status || 'draft', featured === 'true' || featured === true, whatsapp || null]
    );
    const productId = rows[0].id;

    for (let i = 0; i < photoFiles.length; i++) {
      try {
        const file = photoFiles[i];
        console.log(`[products POST] upload foto ${i + 1}/${photoFiles.length} — ${file.originalname} (${file.mimetype}, ${file.size} bytes)`);
        const url = await uploadFile(file);
        await db.query('INSERT INTO product_photos (product_id, image) VALUES ($1, $2)', [productId, url]);
      } catch (photoErr) {
        console.error(`[products POST] FALHA na foto ${i + 1}:`, photoErr?.message || photoErr);
      }
    }

    const { rows: full } = await db.query(
      `${SELECT_WITH_PHOTOS} WHERE p.id=$1 GROUP BY p.id`,
      [productId]
    );
    res.status(201).json(full[0]);
  } catch (err) {
    console.error('Erro ao criar produto:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Erro ao criar produto.' });
  }
});

// ── Admin: atualizar ───────────────────────────────────────────
router.put('/admin/:id', authenticate, productUpload, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, full_content, cover_image, category, price, stock, status, featured, whatsapp } = req.body;
    const { coverFile, photoFiles } = splitFiles(req);

    let imageUrl = cover_image || null;
    if (coverFile) {
      imageUrl = await uploadFile(coverFile);
    } else if (!imageUrl) {
      const ex = await db.query('SELECT cover_image FROM products WHERE id=$1', [id]);
      imageUrl = ex.rows[0]?.cover_image || null;
    }

    const upd = await db.query(
      `UPDATE products SET title=$1, description=$2, full_content=$3, cover_image=$4, category=$5,
       price=$6, stock=$7, status=$8, featured=$9, whatsapp=$10, updated_at=NOW()
       WHERE id=$11 RETURNING id`,
      [title, description, full_content || null, imageUrl, category || null,
       parseFloat(price) || 0, parseInt(stock) || 0, status || 'draft', featured === 'true' || featured === true, whatsapp || null, id]
    );
    if (!upd.rows.length) return res.status(404).json({ error: 'Produto não encontrado.' });

    if (photoFiles.length > 0) {
      const count = await db.query('SELECT COUNT(*)::int AS count FROM product_photos WHERE product_id=$1', [id]);
      const remaining = MAX_PHOTOS - Number(count.rows[0].count);
      const toUpload = photoFiles.slice(0, remaining);
      for (let i = 0; i < toUpload.length; i++) {
        try {
          const file = toUpload[i];
          console.log(`[products PUT] upload foto ${i + 1}/${toUpload.length} — ${file.originalname} (${file.mimetype}, ${file.size} bytes)`);
          const url = await uploadFile(file);
          await db.query('INSERT INTO product_photos (product_id, image) VALUES ($1, $2)', [id, url]);
        } catch (photoErr) {
          console.error(`[products PUT] FALHA na foto ${i + 1}:`, photoErr?.message || photoErr);
        }
      }
    }

    const { rows: full } = await db.query(
      `${SELECT_WITH_PHOTOS} WHERE p.id=$1 GROUP BY p.id`,
      [id]
    );
    res.json(full[0]);
  } catch (err) {
    console.error('Erro ao atualizar produto:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Erro ao atualizar produto.' });
  }
});

// ── Admin: deletar foto extra ──────────────────────────────────
router.delete('/admin/photos/:photoId', authenticate, async (req, res) => {
  try {
    await db.query('DELETE FROM product_photos WHERE id=$1', [req.params.photoId]);
    res.status(204).send();
  } catch {
    res.status(500).json({ error: 'Erro ao excluir foto.' });
  }
});

// ── Admin: excluir produto ─────────────────────────────────────
router.delete('/admin/:id', authenticate, async (req, res) => {
  try {
    await db.query('DELETE FROM products WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch {
    res.status(500).json({ error: 'Erro ao excluir produto.' });
  }
});

module.exports = router;
