const router = require('express').Router();
const db = require('../db/index');
const authenticate = require('../middleware/authenticate');
const upload = require('../middleware/upload');
const { uploadFile } = require('../lib/cloudinary');

const MAX_PHOTOS = 10;
const MAX_VIDEOS = 10;
const MAX_TRACKS = 20;

// Aceita qualquer fieldname; filtra manualmente
const artistUpload = upload.any();

function splitFiles(req) {
  const all = req.files || [];
  return {
    coverFile: all.find((f) => f.fieldname === 'cover_image_file'),
    profileFile: all.find((f) => f.fieldname === 'profile_image_file'),
    photoFiles: all.filter((f) => f.fieldname === 'photo_files').slice(0, MAX_PHOTOS),
    videoFiles: all.filter((f) => f.fieldname === 'video_files').slice(0, MAX_VIDEOS),
    trackFiles: all.filter((f) => f.fieldname === 'track_files').slice(0, MAX_TRACKS),
  };
}

const SELECT_WITH_MEDIA = `
  SELECT a.*,
         COALESCE(
           (SELECT json_agg(json_build_object('id', ap.id, 'image', ap.image) ORDER BY ap.created_at)
            FROM artist_photos ap WHERE ap.artist_id = a.id),
           '[]'
         ) AS photos,
         COALESCE(
           (SELECT json_agg(json_build_object('id', av.id, 'video_url', av.video_url) ORDER BY av.created_at)
            FROM artist_videos av WHERE av.artist_id = a.id),
           '[]'
         ) AS videos,
         COALESCE(
           (SELECT json_agg(json_build_object('id', at.id, 'audio_url', at.audio_url, 'title', at.title) ORDER BY at.created_at)
            FROM artist_tracks at WHERE at.artist_id = a.id),
           '[]'
         ) AS tracks
  FROM artists a
`;

// ── Público ────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query(
      `${SELECT_WITH_MEDIA} WHERE a.status = 'published' ORDER BY a.created_at DESC`
    );
    res.json(rows);
  } catch (error) {
    console.error('Erro ao buscar artistas:', error?.message);
    res.status(500).json({ error: 'Erro interno.' });
  }
});

// ── Admin: listar ──────────────────────────────────────────────
router.get('/admin', authenticate, async (req, res) => {
  try {
    const { rows } = await db.query(
      `${SELECT_WITH_MEDIA} ORDER BY a.created_at DESC`
    );
    res.json(rows);
  } catch (error) {
    console.error('Erro ao buscar artistas admin:', error?.message);
    res.status(500).json({ error: 'Erro interno.' });
  }
});

async function uploadAndInsertPhotos(artistId, files) {
  for (let i = 0; i < files.length; i++) {
    try {
      const url = await uploadFile(files[i]);
      await db.query('INSERT INTO artist_photos (artist_id, image) VALUES ($1, $2)', [artistId, url]);
    } catch (err) {
      console.error(`[artists] FALHA foto ${i + 1}:`, err?.message);
    }
  }
}

async function uploadAndInsertVideos(artistId, files) {
  for (let i = 0; i < files.length; i++) {
    try {
      const url = await uploadFile(files[i]);
      await db.query('INSERT INTO artist_videos (artist_id, video_url) VALUES ($1, $2)', [artistId, url]);
    } catch (err) {
      console.error(`[artists] FALHA video ${i + 1}:`, err?.message);
    }
  }
}

async function uploadAndInsertTracks(artistId, files) {
  for (let i = 0; i < files.length; i++) {
    try {
      const file = files[i];
      const url = await uploadFile(file);
      // Usa o nome do arquivo (sem extensão) como título inicial
      const title = (file.originalname || `Faixa ${i + 1}`).replace(/\.[^.]+$/, '').slice(0, 200);
      await db.query('INSERT INTO artist_tracks (artist_id, audio_url, title) VALUES ($1, $2, $3)', [artistId, url, title]);
    } catch (err) {
      console.error(`[artists] FALHA track ${i + 1}:`, err?.message);
    }
  }
}

// ── Admin: criar ───────────────────────────────────────────────
router.post('/admin', authenticate, artistUpload, async (req, res) => {
  try {
    const { name, project_name, age, musical_styles, presskit_url, career_years, biography, status, featured } = req.body;
    const { coverFile, profileFile, photoFiles, videoFiles, trackFiles } = splitFiles(req);
    const featuredVal = featured === 'true' || featured === true;

    const coverUrl = coverFile ? await uploadFile(coverFile) : null;
    const profileUrl = profileFile ? await uploadFile(profileFile) : null;

    const { rows } = await db.query(
      `INSERT INTO artists (name, project_name, age, musical_styles, presskit_url, career_years, biography, status, featured, cover_image, profile_image)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [
        name,
        project_name || null,
        age ? Number(age) : null,
        musical_styles || null,
        presskit_url || null,
        career_years ? Number(career_years) : null,
        biography || null,
        status || 'draft',
        featuredVal,
        coverUrl,
        profileUrl,
      ]
    );

    const artistId = rows[0].id;

    await uploadAndInsertPhotos(artistId, photoFiles);
    await uploadAndInsertVideos(artistId, videoFiles);
    await uploadAndInsertTracks(artistId, trackFiles);

    const { rows: full } = await db.query(`${SELECT_WITH_MEDIA} WHERE a.id=$1`, [artistId]);
    res.status(201).json(full[0]);
  } catch (error) {
    console.error('Erro ao criar artista:', error?.message || error);
    res.status(500).json({ error: error?.message || 'Erro interno.' });
  }
});

// ── Admin: atualizar ───────────────────────────────────────────
router.put('/admin/:id', authenticate, artistUpload, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, project_name, age, musical_styles, presskit_url, career_years, biography, status, featured } = req.body;
    const { coverFile, profileFile, photoFiles, videoFiles, trackFiles } = splitFiles(req);
    const featuredVal = featured === 'true' || featured === true;

    const existing = await db.query('SELECT cover_image, profile_image FROM artists WHERE id=$1', [id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Artista não encontrado.' });
    const prev = existing.rows[0];

    const coverUrl = coverFile ? await uploadFile(coverFile) : (prev.cover_image || null);
    const profileUrl = profileFile ? await uploadFile(profileFile) : (prev.profile_image || null);

    await db.query(
      `UPDATE artists SET name=$1, project_name=$2, age=$3, musical_styles=$4, presskit_url=$5, career_years=$6,
       biography=$7, status=$8, featured=$9, cover_image=$10, profile_image=$11, updated_at=NOW()
       WHERE id=$12`,
      [
        name,
        project_name || null,
        age ? Number(age) : null,
        musical_styles || null,
        presskit_url || null,
        career_years ? Number(career_years) : null,
        biography || null,
        status || 'draft',
        featuredVal,
        coverUrl,
        profileUrl,
        id,
      ]
    );

    if (photoFiles.length > 0) {
      const count = await db.query('SELECT COUNT(*)::int AS count FROM artist_photos WHERE artist_id=$1', [id]);
      const remaining = MAX_PHOTOS - Number(count.rows[0].count);
      await uploadAndInsertPhotos(id, photoFiles.slice(0, remaining));
    }

    if (videoFiles.length > 0) {
      const count = await db.query('SELECT COUNT(*)::int AS count FROM artist_videos WHERE artist_id=$1', [id]);
      const remaining = MAX_VIDEOS - Number(count.rows[0].count);
      await uploadAndInsertVideos(id, videoFiles.slice(0, remaining));
    }

    if (trackFiles.length > 0) {
      const count = await db.query('SELECT COUNT(*)::int AS count FROM artist_tracks WHERE artist_id=$1', [id]);
      const remaining = MAX_TRACKS - Number(count.rows[0].count);
      await uploadAndInsertTracks(id, trackFiles.slice(0, remaining));
    }

    const { rows: full } = await db.query(`${SELECT_WITH_MEDIA} WHERE a.id=$1`, [id]);
    res.json(full[0]);
  } catch (error) {
    console.error('Erro ao atualizar artista:', error?.message || error);
    res.status(500).json({ error: error?.message || 'Erro interno.' });
  }
});

// ── Admin: excluir foto individual ─────────────────────────────
router.delete('/admin/photos/:photoId', authenticate, async (req, res) => {
  try {
    await db.query('DELETE FROM artist_photos WHERE id=$1', [req.params.photoId]);
    res.status(204).send();
  } catch (error) {
    console.error('Erro ao excluir foto:', error?.message);
    res.status(500).json({ error: 'Erro interno.' });
  }
});

// ── Admin: excluir vídeo individual ────────────────────────────
router.delete('/admin/videos/:videoId', authenticate, async (req, res) => {
  try {
    await db.query('DELETE FROM artist_videos WHERE id=$1', [req.params.videoId]);
    res.status(204).send();
  } catch (error) {
    console.error('Erro ao excluir video:', error?.message);
    res.status(500).json({ error: 'Erro interno.' });
  }
});

// ── Admin: excluir track individual ────────────────────────────
router.delete('/admin/tracks/:trackId', authenticate, async (req, res) => {
  try {
    await db.query('DELETE FROM artist_tracks WHERE id=$1', [req.params.trackId]);
    res.status(204).send();
  } catch (error) {
    console.error('Erro ao excluir track:', error?.message);
    res.status(500).json({ error: 'Erro interno.' });
  }
});

// ── Admin: excluir artista ─────────────────────────────────────
router.delete('/admin/:id', authenticate, async (req, res) => {
  try {
    await db.query('DELETE FROM artists WHERE id=$1', [req.params.id]);
    res.status(204).send();
  } catch (error) {
    console.error('Erro ao excluir artista:', error?.message);
    res.status(500).json({ error: 'Erro interno.' });
  }
});

module.exports = router;
