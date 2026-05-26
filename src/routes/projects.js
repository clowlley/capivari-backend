const router = require('express').Router();
const db = require('../db/index');
const authenticate = require('../middleware/authenticate');
const upload = require('../middleware/upload');
const { uploadFile } = require('../lib/cloudinary');

function slugify(str) {
  return String(str || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Rotas Públicas (/api/projects)
router.get('/', async (req, res) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 9);
    const search = String(req.query.search || '').trim();

    const offset = (page - 1) * limit;

    const where = [];
    const params = [];

    // Somente projetos publicados (se quiser depois, troque para status filter)
    // where.push(`status = $X`); params.push('published');

    if (search) {
      params.push(`%${search}%`);
      where.push(`(title ILIKE $${params.length} OR category ILIKE $${params.length})`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countRes = await db.query(
      `SELECT COUNT(*)::int AS count FROM projects ${whereSql}`,
      params
    );

    const total = Number(countRes.rows[0]?.count || 0);

    const { rows } = await db.query(
      `SELECT * FROM projects
       ${whereSql}
       ORDER BY created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    const data = rows.map((p) => ({
      id: p.id,
      slug: slugify(p.title),
      title: p.title,
      description: p.description,
      full_content: p.full_content,
      cover_image: p.cover_image,
      video_url: p.video_url,
      category: p.category,
      featured: !!p.featured,
      status: p.status,
      created_at: p.created_at,
    }));

    res.json({ data, total, page, limit });
  } catch (error) {
    console.error('Erro ao buscar projetos:', error);
    res.status(500).json({ error: 'Erro interno ao buscar projetos.' });
  }
});

// Rotas Admin (/api/admin/projects)
router.get('/admin', authenticate, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM projects ORDER BY created_at DESC');
    res.json(rows);
  } catch (error) {
    console.error('Erro ao buscar projetos admin:', error);
    res.status(500).json({ error: 'Erro interno ao buscar projetos admin.' });
  }
});

const projectUpload = upload.fields([
  { name: 'cover_image_file', maxCount: 1 },
  { name: 'video_file', maxCount: 1 },
]);

router.post('/admin', authenticate, projectUpload, async (req, res) => {
  try {
    const { title, description, full_content, cover_image, video_url, category, status, featured } = req.body;
    const imageFile = req.files?.cover_image_file?.[0];
    const videoFile = req.files?.video_file?.[0];
    const imageUrl = imageFile ? await uploadFile(imageFile) : (cover_image || null);
    const videoFinalUrl = videoFile ? await uploadFile(videoFile) : (video_url || null);
    const featuredVal = featured === 'true' || featured === true;

    const { rows } = await db.query(
      `INSERT INTO projects (title, description, full_content, cover_image, video_url, category, status, featured)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [title, description, full_content || null, imageUrl, videoFinalUrl, category || null, status || 'draft', featuredVal]
    );

    res.status(201).json(rows[0]);
  } catch (error) {
    console.error('Erro ao criar projeto:', error);
    res.status(500).json({ error: 'Erro interno ao criar projeto.' });
  }
});

router.put('/admin/:id', authenticate, projectUpload, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, full_content, cover_image, video_url, category, status, featured } = req.body;

    const imageFile = req.files?.cover_image_file?.[0];
    const videoFile = req.files?.video_file?.[0];
    const featuredVal = featured === 'true' || featured === true;

    let imageUrl = cover_image || null;
    if (imageFile) {
      imageUrl = await uploadFile(imageFile);
    } else if (!imageUrl) {
      const existing = await db.query('SELECT cover_image FROM projects WHERE id=$1', [id]);
      imageUrl = existing.rows[0]?.cover_image || null;
    }

    let videoFinalUrl = video_url || null;
    if (videoFile) {
      videoFinalUrl = await uploadFile(videoFile);
    } else if (!videoFinalUrl) {
      const existing = await db.query('SELECT video_url FROM projects WHERE id=$1', [id]);
      videoFinalUrl = existing.rows[0]?.video_url || null;
    }

    const { rows } = await db.query(
      `UPDATE projects SET title=$1, description=$2, full_content=$3, cover_image=$4, video_url=$5, category=$6, status=$7, featured=$8, updated_at=NOW()
       WHERE id=$9 RETURNING *`,
      [title, description, full_content || null, imageUrl, videoFinalUrl, category || null, status || 'draft', featuredVal, id]
    );

    if (rows.length === 0) return res.status(404).json({ error: 'Projeto não encontrado.' });
    res.json(rows[0]);
  } catch (error) {
    console.error('Erro ao atualizar projeto:', error);
    res.status(500).json({ error: 'Erro interno ao atualizar projeto.' });
  }
});

router.delete('/admin/:id', authenticate, async (req, res) => {
  try {
    await db.query('DELETE FROM projects WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch (error) {
    console.error('Erro ao excluir projeto:', error);
    res.status(500).json({ error: 'Erro interno ao excluir projeto.' });
  }
});

module.exports = router;