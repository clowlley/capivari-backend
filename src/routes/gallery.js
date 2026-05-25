const router = require('express').Router();
const db = require('../db/index');
const authenticate = require('../middleware/authenticate');
const upload = require('../middleware/upload');

// GET /api/gallery/albums (Público)
router.get('/albums', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT a.*, e.title as event_title
      FROM albums a
      LEFT JOIN events e ON a.event_id = e.id
      ORDER BY a.created_at DESC
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar álbuns' });
  }
});

// POST /api/gallery/admin/albums (Admin)
router.post('/admin/albums', authenticate, upload.single('cover_image_file'), async (req, res) => {
  try {
    const { title, event_id, cover_image } = req.body;
    const cover = req.file ? `/uploads/${req.file.filename}` : (cover_image || null);

    const { rows } = await db.query(
      'INSERT INTO albums (title, event_id, cover_image) VALUES ($1, $2, $3) RETURNING *',
      [title, event_id || null, cover]
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    console.error('Erro ao criar álbum:', error);
    res.status(500).json({ error: 'Erro ao criar álbum' });
  }
});

// DELETE /api/gallery/admin/albums/:id (Admin)
router.delete('/admin/albums/:id', authenticate, async (req, res) => {
  try {
    await db.query('DELETE FROM albums WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Erro ao excluir álbum' });
  }
});

// GET /api/gallery/album/:albumId (Público)
router.get('/album/:albumId', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM gallery WHERE album_id = $1 ORDER BY created_at ASC',
      [req.params.albumId]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar imagens do álbum' });
  }
});

// GET /api/gallery/ (Público)
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT g.*, a.title as album_title, e.title as event_title
      FROM gallery g
      LEFT JOIN albums a ON g.album_id = a.id
      LEFT JOIN events e ON a.event_id = e.id
      ORDER BY g.created_at DESC
    `);
    res.json(rows);
  } catch (error) {
    console.error('Erro ao buscar galeria:', error);
    res.status(500).json({ error: 'Erro ao buscar galeria' });
  }
});

// POST /api/gallery/admin/bulk (Admin - Upload em massa, máx 100)
router.post('/admin/bulk', authenticate, upload.array('image_files', 100), async (req, res) => {
  try {
    const { album_id } = req.body;
    if (!req.files || !req.files.length) {
      return res.status(400).json({ error: 'Nenhuma imagem enviada' });
    }
    const results = [];
    for (const file of req.files) {
      const { rows } = await db.query(
        'INSERT INTO gallery (title, image, album_id) VALUES ($1, $2, $3) RETURNING *',
        ['', `/uploads/${file.filename}`, album_id || null]
      );
      results.push(rows[0]);
    }
    res.status(201).json(results);
  } catch (error) {
    console.error('Erro no upload em massa:', error);
    res.status(500).json({ error: 'Erro no upload em massa' });
  }
});

// POST /api/gallery/admin (Admin - Upload de imagem)
router.post('/admin', authenticate, upload.single('image_file'), async (req, res) => {
  try {
    const { title, album_id } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'Nenhuma imagem enviada' });
    }

    const image_url = `/uploads/${req.file.filename}`;

    const { rows } = await db.query(
      'INSERT INTO gallery (title, image, album_id) VALUES ($1, $2, $3) RETURNING *',
      [title || '', image_url, album_id || null]
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    console.error('Erro ao subir imagem:', error);
    res.status(500).json({ error: 'Erro ao subir imagem' });
  }
});

// DELETE /api/gallery/admin/:id (Admin - Remove imagem)
router.delete('/admin/:id', authenticate, async (req, res) => {
  try {
    await db.query('DELETE FROM gallery WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Erro ao excluir imagem' });
  }
});

module.exports = router;
