const router = require('express').Router();
const db = require('../db/index');
const authenticate = require('../middleware/authenticate');
const upload = require('../middleware/upload');
const { uploadFile } = require('../lib/cloudinary');

const MAX_PHOTOS = 10;
const MAX_VIDEOS = 10;
const MAX_TRACKS = 20;

function slugify(str) {
  return String(str || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Aceita qualquer fieldname; filtra manualmente
const projectUpload = upload.any();

function splitFiles(req) {
  const all = req.files || [];
  return {
    coverFile: all.find((f) => f.fieldname === 'cover_image_file'),
    photoFiles: all.filter((f) => f.fieldname === 'photo_files').slice(0, MAX_PHOTOS),
    videoFiles: all.filter((f) => f.fieldname === 'video_files').slice(0, MAX_VIDEOS),
    trackFiles: all.filter((f) => f.fieldname === 'track_files').slice(0, MAX_TRACKS),
  };
}

const SELECT_WITH_MEDIA = `
  SELECT p.*,
         COALESCE(
           (SELECT json_agg(json_build_object('id', pp.id, 'image', pp.image) ORDER BY pp.created_at)
            FROM project_photos pp WHERE pp.project_id = p.id),
           '[]'
         ) AS photos,
         COALESCE(
           (SELECT json_agg(json_build_object('id', pv.id, 'video_url', pv.video_url) ORDER BY pv.created_at)
            FROM project_videos pv WHERE pv.project_id = p.id),
           '[]'
         ) AS videos,
         COALESCE(
           (SELECT json_agg(json_build_object('id', pt.id, 'audio_url', pt.audio_url, 'title', pt.title) ORDER BY pt.created_at)
            FROM project_tracks pt WHERE pt.project_id = p.id),
           '[]'
         ) AS tracks
  FROM projects p
`;

function mapRow(p) {
  return {
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
    updated_at: p.updated_at,
    photos: p.photos || [],
    videos: p.videos || [],
    tracks: p.tracks || [],
  };
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

    if (search) {
      params.push(`%${search}%`);
      where.push(`(p.title ILIKE $${params.length} OR p.category ILIKE $${params.length})`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countRes = await db.query(
      `SELECT COUNT(*)::int AS count FROM projects p ${whereSql}`,
      params
    );

    const total = Number(countRes.rows[0]?.count || 0);

    const { rows } = await db.query(
      `${SELECT_WITH_MEDIA}
       ${whereSql}
       ORDER BY p.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    res.json({ data: rows.map(mapRow), total, page, limit });
  } catch (error) {
    console.error('Erro ao buscar projetos:', error);
    res.status(500).json({ error: 'Erro interno ao buscar projetos.' });
  }
});

// Rotas Admin (/api/admin/projects)
router.get('/admin', authenticate, async (req, res) => {
  try {
    const { rows } = await db.query(`${SELECT_WITH_MEDIA} ORDER BY p.created_at DESC`);
    res.json(rows.map(mapRow));
  } catch (error) {
    console.error('Erro ao buscar projetos admin:', error);
    res.status(500).json({ error: 'Erro interno ao buscar projetos admin.' });
  }
});

async function uploadAndInsertPhotos(projectId, files) {
  for (let i = 0; i < files.length; i++) {
    try {
      const url = await uploadFile(files[i]);
      await db.query('INSERT INTO project_photos (project_id, image) VALUES ($1, $2)', [projectId, url]);
    } catch (err) {
      console.error(`[projects] FALHA foto ${i + 1}:`, err?.message);
    }
  }
}

async function uploadAndInsertVideos(projectId, files) {
  for (let i = 0; i < files.length; i++) {
    try {
      const url = await uploadFile(files[i]);
      await db.query('INSERT INTO project_videos (project_id, video_url) VALUES ($1, $2)', [projectId, url]);
    } catch (err) {
      console.error(`[projects] FALHA video ${i + 1}:`, err?.message);
    }
  }
}

async function uploadAndInsertTracks(projectId, files) {
  for (let i = 0; i < files.length; i++) {
    try {
      const file = files[i];
      const url = await uploadFile(file);
      const title = (file.originalname || `Faixa ${i + 1}`).replace(/\.[^.]+$/, '').slice(0, 200);
      await db.query('INSERT INTO project_tracks (project_id, audio_url, title) VALUES ($1, $2, $3)', [projectId, url, title]);
    } catch (err) {
      console.error(`[projects] FALHA track ${i + 1}:`, err?.message);
    }
  }
}

router.post('/admin', authenticate, projectUpload, async (req, res) => {
  try {
    const { title, description, full_content, cover_image, video_url, category, status, featured } = req.body;
    const { coverFile, photoFiles, videoFiles, trackFiles } = splitFiles(req);
    const imageUrl = coverFile ? await uploadFile(coverFile) : (cover_image || null);
    const featuredVal = featured === 'true' || featured === true;

    const { rows } = await db.query(
      `INSERT INTO projects (title, description, full_content, cover_image, video_url, category, status, featured)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [title, description, full_content || null, imageUrl, video_url || null, category || null, status || 'draft', featuredVal]
    );

    const projectId = rows[0].id;

    await uploadAndInsertPhotos(projectId, photoFiles);
    await uploadAndInsertVideos(projectId, videoFiles);
    await uploadAndInsertTracks(projectId, trackFiles);

    const { rows: full } = await db.query(`${SELECT_WITH_MEDIA} WHERE p.id=$1`, [projectId]);
    res.status(201).json(mapRow(full[0]));
  } catch (error) {
    console.error('Erro ao criar projeto:', error);
    res.status(500).json({ error: 'Erro interno ao criar projeto.' });
  }
});

router.put('/admin/:id', authenticate, projectUpload, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, full_content, cover_image, video_url, category, status, featured } = req.body;
    const { coverFile, photoFiles, videoFiles, trackFiles } = splitFiles(req);
    const featuredVal = featured === 'true' || featured === true;

    const existing = await db.query('SELECT cover_image FROM projects WHERE id=$1', [id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Projeto não encontrado.' });

    let imageUrl = cover_image || null;
    if (coverFile) {
      imageUrl = await uploadFile(coverFile);
    } else if (!imageUrl) {
      imageUrl = existing.rows[0]?.cover_image || null;
    }

    await db.query(
      `UPDATE projects SET title=$1, description=$2, full_content=$3, cover_image=$4, video_url=$5, category=$6, status=$7, featured=$8, updated_at=NOW()
       WHERE id=$9`,
      [title, description, full_content || null, imageUrl, video_url || null, category || null, status || 'draft', featuredVal, id]
    );

    if (photoFiles.length > 0) {
      const count = await db.query('SELECT COUNT(*)::int AS count FROM project_photos WHERE project_id=$1', [id]);
      const remaining = MAX_PHOTOS - Number(count.rows[0].count);
      await uploadAndInsertPhotos(id, photoFiles.slice(0, remaining));
    }

    if (videoFiles.length > 0) {
      const count = await db.query('SELECT COUNT(*)::int AS count FROM project_videos WHERE project_id=$1', [id]);
      const remaining = MAX_VIDEOS - Number(count.rows[0].count);
      await uploadAndInsertVideos(id, videoFiles.slice(0, remaining));
    }

    if (trackFiles.length > 0) {
      const count = await db.query('SELECT COUNT(*)::int AS count FROM project_tracks WHERE project_id=$1', [id]);
      const remaining = MAX_TRACKS - Number(count.rows[0].count);
      await uploadAndInsertTracks(id, trackFiles.slice(0, remaining));
    }

    const { rows: full } = await db.query(`${SELECT_WITH_MEDIA} WHERE p.id=$1`, [id]);
    res.json(mapRow(full[0]));
  } catch (error) {
    console.error('Erro ao atualizar projeto:', error);
    res.status(500).json({ error: 'Erro interno ao atualizar projeto.' });
  }
});

// ── Admin: excluir mídia individual ────────────────────────────
router.delete('/admin/photos/:photoId', authenticate, async (req, res) => {
  try {
    await db.query('DELETE FROM project_photos WHERE id=$1', [req.params.photoId]);
    res.status(204).send();
  } catch (error) {
    console.error('Erro ao excluir foto:', error?.message);
    res.status(500).json({ error: 'Erro interno.' });
  }
});

router.delete('/admin/videos/:videoId', authenticate, async (req, res) => {
  try {
    await db.query('DELETE FROM project_videos WHERE id=$1', [req.params.videoId]);
    res.status(204).send();
  } catch (error) {
    console.error('Erro ao excluir video:', error?.message);
    res.status(500).json({ error: 'Erro interno.' });
  }
});

router.delete('/admin/tracks/:trackId', authenticate, async (req, res) => {
  try {
    await db.query('DELETE FROM project_tracks WHERE id=$1', [req.params.trackId]);
    res.status(204).send();
  } catch (error) {
    console.error('Erro ao excluir track:', error?.message);
    res.status(500).json({ error: 'Erro interno.' });
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
