const router = require('express').Router();
const db = require('../db/index');
const authenticate = require('../middleware/authenticate');
const upload = require('../middleware/upload');

function slugify(str) {
  return String(str || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Rotas Públicas
router.get('/', async (req, res) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 9);
    const upcoming = req.query.upcoming === '1';
    const offset = (page - 1) * limit;

    let whereConditions = ["status != 'draft'"];
    const queryParams = [];

    if (upcoming) {
      whereConditions.push("(status = 'published' AND starts_at >= (NOW() - INTERVAL '4 hours'))");
    }

    const whereSql = `WHERE ${whereConditions.join(' AND ')}`;
    const countRes = await db.query(`SELECT COUNT(*)::int AS count FROM events ${whereSql}`, queryParams);
    const total = Number(countRes.rows[0]?.count || 0);

    const orderBy = upcoming ? 'created_at DESC' : 'starts_at ASC';
    const { rows } = await db.query(
      `SELECT * FROM events ${whereSql} ORDER BY ${orderBy} LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`,
      [...queryParams, limit, offset]
    );

    const data = rows.map((e) => ({ ...e, slug: slugify(e.title) }));
    res.json({ data, total, page, limit });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno ao buscar eventos.' });
  }
});

router.get('/id/:id', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM events WHERE id = $1 AND status != 'draft'`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Evento não encontrado.' });
    res.json({ data: { ...rows[0], slug: slugify(rows[0].title) } });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno.' });
  }
});

router.get('/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const { rows } = await db.query('SELECT * FROM events WHERE status = $1', ['published']);
    const event = rows.find((e) => slugify(e.title) === slug);
    if (!event) return res.status(404).json({ error: 'Evento não encontrado.' });
    return res.json({ data: { ...event, slug } });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno ao buscar evento.' });
  }
});

// Rotas Administrativas
router.get('/admin/list', authenticate, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM events ORDER BY starts_at DESC');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Erro interno ao buscar eventos admin.' });
  }
});

router.post('/admin', authenticate, upload.single('cover_image_file'), async (req, res) => {
  try {
    const { title, description, full_content, cover_image, category, location_name, location_address, starts_at, ends_at, event_type, status, featured, registration_url, max_attendees, price } = req.body;
    const cover_image_final = req.file ? `/uploads/${req.file.filename}` : (cover_image || null);
    const { rows } = await db.query(
      `INSERT INTO events (title, description, full_content, cover_image, category, location_name, location_address, starts_at, ends_at, event_type, status, featured, registration_url, max_attendees, price)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [
        title,
        description || null,
        full_content || null,
        cover_image_final,
        category || null,
        location_name || null,
        location_address || null,
        starts_at || null,
        ends_at || null,
        event_type || null,
        status || 'draft',
        featured === 'true' || featured === true,
        registration_url || null,
        max_attendees ? parseInt(max_attendees) : null,
        price ? parseFloat(price) : 0,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    console.error('Erro ao criar evento:', error);
    res.status(500).json({ error: 'Erro interno ao criar evento.' });
  }
});

router.put('/admin/:id', authenticate, upload.single('cover_image_file'), async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, full_content, cover_image, category, location_name, location_address, starts_at, ends_at, event_type, status, featured, registration_url, max_attendees, price } = req.body;
    let cover_image_final = cover_image || null;
    if (req.file) cover_image_final = `/uploads/${req.file.filename}`;
    const { rows } = await db.query(
      `UPDATE events SET title=$1, description=$2, full_content=$3, cover_image=$4, category=$5, location_name=$6, location_address=$7, starts_at=$8, ends_at=$9, event_type=$10, status=$11, featured=$12, registration_url=$13, max_attendees=$14, price=$15, updated_at=NOW()
       WHERE id=$16 RETURNING *`,
      [
        title,
        description || null,
        full_content || null,
        cover_image_final,
        category || null,
        location_name || null,
        location_address || null,
        starts_at || null,
        ends_at || null,
        event_type || null,
        status || 'draft',
        featured === 'true' || featured === true,
        registration_url || null,
        max_attendees ? parseInt(max_attendees) : null,
        price ? parseFloat(price) : 0,
        id,
      ]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Evento não encontrado.' });
    res.json(rows[0]);
  } catch (error) {
    console.error('Erro ao atualizar evento:', error);
    res.status(500).json({ error: 'Erro ao atualizar evento.' });
  }
});

router.patch('/admin/:id/complete', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await db.query(
      `UPDATE events SET status='completed', updated_at=NOW() WHERE id=$1 RETURNING *`,
      [id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Evento não encontrado.' });
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao concluir evento.' });
  }
});

router.delete('/admin/:id', authenticate, async (req, res) => {
  try {
    await db.query('DELETE FROM events WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Erro ao excluir evento.' });
  }
});

module.exports = router;