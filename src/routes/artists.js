const router = require('express').Router();
const db = require('../db/index');
const authenticate = require('../middleware/authenticate');
const upload = require('../middleware/upload');
const { uploadFile } = require('../lib/cloudinary');

const artistUpload = upload.fields([
  { name: 'cover_image_file', maxCount: 1 },
  { name: 'profile_image_file', maxCount: 1 },
  { name: 'photo_files', maxCount: 4 },
]);

// Público
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT a.*, COALESCE(json_agg(json_build_object('id', ap.id, 'image', ap.image) ORDER BY ap.created_at) FILTER (WHERE ap.id IS NOT NULL), '[]') AS photos
       FROM artists a
       LEFT JOIN artist_photos ap ON ap.artist_id = a.id
       WHERE a.status = 'published'
       GROUP BY a.id
       ORDER BY a.created_at DESC`
    );
    res.json(rows);
  } catch (error) {
    console.error('Erro ao buscar artistas:', error);
    res.status(500).json({ error: 'Erro interno.' });
  }
});

// Admin — listar
router.get('/admin', authenticate, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT a.*, COALESCE(json_agg(json_build_object('id', ap.id, 'image', ap.image) ORDER BY ap.created_at) FILTER (WHERE ap.id IS NOT NULL), '[]') AS photos
       FROM artists a
       LEFT JOIN artist_photos ap ON ap.artist_id = a.id
       GROUP BY a.id
       ORDER BY a.created_at DESC`
    );
    res.json(rows);
  } catch (error) {
    console.error('Erro ao buscar artistas admin:', error);
    res.status(500).json({ error: 'Erro interno.' });
  }
});

// Admin — criar
router.post('/admin', authenticate, artistUpload, async (req, res) => {
  try {
    const { name, project_name, age, musical_styles, presskit_url, career_years, biography, status, featured } = req.body;
    const coverFile = req.files?.cover_image_file?.[0];
    const profileFile = req.files?.profile_image_file?.[0];
    const photoFiles = req.files?.photo_files || [];
    const featuredVal = featured === 'true' || featured === true;

    const coverUrl = coverFile ? await uploadFile(coverFile) : null;
    const profileUrl = profileFile ? await uploadFile(profileFile) : null;

    const { rows } = await db.query(
      `INSERT INTO artists (name, project_name, age, musical_styles, presskit_url, career_years, biography, status, featured, cover_image, profile_image)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
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

    const artist = rows[0];

    for (const file of photoFiles) {
      const photoUrl = await uploadFile(file);
      await db.query('INSERT INTO artist_photos (artist_id, image) VALUES ($1, $2)', [artist.id, photoUrl]);
    }

    const { rows: full } = await db.query(
      `SELECT a.*, COALESCE(json_agg(json_build_object('id', ap.id, 'image', ap.image) ORDER BY ap.created_at) FILTER (WHERE ap.id IS NOT NULL), '[]') AS photos
       FROM artists a LEFT JOIN artist_photos ap ON ap.artist_id = a.id WHERE a.id=$1 GROUP BY a.id`,
      [artist.id]
    );
    res.status(201).json(full[0]);
  } catch (error) {
    console.error('Erro ao criar artista:', error);
    res.status(500).json({ error: 'Erro interno.' });
  }
});

// Admin — atualizar
router.put('/admin/:id', authenticate, artistUpload, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, project_name, age, musical_styles, presskit_url, career_years, biography, status, featured } = req.body;
    const coverFile = req.files?.cover_image_file?.[0];
    const profileFile = req.files?.profile_image_file?.[0];
    const photoFiles = req.files?.photo_files || [];
    const featuredVal = featured === 'true' || featured === true;

    const existing = await db.query('SELECT cover_image, profile_image FROM artists WHERE id=$1', [id]);
    const prev = existing.rows[0] || {};

    const coverUrl = coverFile ? await uploadFile(coverFile) : (prev.cover_image || null);
    const profileUrl = profileFile ? await uploadFile(profileFile) : (prev.profile_image || null);

    const { rows } = await db.query(
      `UPDATE artists SET name=$1, project_name=$2, age=$3, musical_styles=$4, presskit_url=$5, career_years=$6,
       biography=$7, status=$8, featured=$9, cover_image=$10, profile_image=$11, updated_at=NOW()
       WHERE id=$12 RETURNING *`,
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

    if (rows.length === 0) return res.status(404).json({ error: 'Artista não encontrado.' });

    const photoCount = await db.query('SELECT COUNT(*)::int AS count FROM artist_photos WHERE artist_id=$1', [id]);
    const remaining = 4 - Number(photoCount.rows[0].count);
    for (const file of photoFiles.slice(0, remaining)) {
      const photoUrl = await uploadFile(file);
      await db.query('INSERT INTO artist_photos (artist_id, image) VALUES ($1, $2)', [id, photoUrl]);
    }

    const { rows: full } = await db.query(
      `SELECT a.*, COALESCE(json_agg(json_build_object('id', ap.id, 'image', ap.image) ORDER BY ap.created_at) FILTER (WHERE ap.id IS NOT NULL), '[]') AS photos
       FROM artists a LEFT JOIN artist_photos ap ON ap.artist_id = a.id WHERE a.id=$1 GROUP BY a.id`,
      [id]
    );
    res.json(full[0]);
  } catch (error) {
    console.error('Erro ao atualizar artista:', error);
    res.status(500).json({ error: 'Erro interno.' });
  }
});

// Admin — excluir foto individual
router.delete('/admin/photos/:photoId', authenticate, async (req, res) => {
  try {
    await db.query('DELETE FROM artist_photos WHERE id=$1', [req.params.photoId]);
    res.status(204).send();
  } catch (error) {
    console.error('Erro ao excluir foto:', error);
    res.status(500).json({ error: 'Erro interno.' });
  }
});

// Admin — excluir artista
router.delete('/admin/:id', authenticate, async (req, res) => {
  try {
    await db.query('DELETE FROM artists WHERE id=$1', [req.params.id]);
    res.status(204).send();
  } catch (error) {
    console.error('Erro ao excluir artista:', error);
    res.status(500).json({ error: 'Erro interno.' });
  }
});

module.exports = router;
