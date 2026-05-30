const express = require('express');
const router = express.Router();
const db = require('../db');
const authenticateUser = require('../middleware/authenticate-user');
const upload = require('../middleware/upload');
const { uploadFile } = require('../lib/cloudinary');

// Toda a área de comunidade exige usuário logado
router.use(authenticateUser);

function isOwnerOrAdmin(req, ownerId) {
  return req.user.id === ownerId || req.user.role === 'admin';
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acesso negado.' });
  next();
}

// ── Categorias ──
router.get('/categories', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT c.id, c.name, c.slug, c.description, c.position,
        (SELECT COUNT(*)::int FROM forum_topics t WHERE t.category_id = c.id) AS topic_count
      FROM forum_categories c
      ORDER BY c.position ASC, c.name ASC
    `);
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Erro ao buscar categorias.' });
  }
});

// ── Listar tópicos (opcionalmente por categoria via ?category=slug) ──
router.get('/topics', async (req, res) => {
  try {
    const { category } = req.query;
    const params = [req.user.id];
    const conditions = [`t.status = 'approved'`];
    if (typeof category === 'string' && category.trim()) {
      params.push(category.trim());
      conditions.push(`c.slug = $${params.length}`);
    }
    const where = `WHERE ${conditions.join(' AND ')}`;
    const { rows } = await db.query(`
      SELECT t.id, t.title, t.content, t.image_url, t.created_at, t.updated_at,
        c.id AS category_id, c.name AS category_name, c.slug AS category_slug,
        u.id AS author_id, u.name AS author_name, u.avatar_url AS author_avatar,
        (SELECT COUNT(*)::int FROM forum_replies r WHERE r.topic_id = t.id) AS reply_count,
        (SELECT COUNT(*)::int FROM forum_topic_likes l WHERE l.topic_id = t.id) AS like_count,
        EXISTS(SELECT 1 FROM forum_topic_likes l WHERE l.topic_id = t.id AND l.user_id = $1) AS liked
      FROM forum_topics t
      JOIN forum_categories c ON c.id = t.category_id
      JOIN users u ON u.id = t.user_id
      ${where}
      ORDER BY t.created_at DESC
    `, params);
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Erro ao buscar tópicos.' });
  }
});

// ── Detalhe de um tópico + respostas ──
router.get('/topics/:id', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT t.id, t.title, t.content, t.image_url, t.status, t.created_at, t.updated_at,
        c.id AS category_id, c.name AS category_name, c.slug AS category_slug,
        u.id AS author_id, u.name AS author_name, u.avatar_url AS author_avatar,
        (SELECT COUNT(*)::int FROM forum_topic_likes l WHERE l.topic_id = t.id) AS like_count,
        EXISTS(SELECT 1 FROM forum_topic_likes l WHERE l.topic_id = t.id AND l.user_id = $2) AS liked
      FROM forum_topics t
      JOIN forum_categories c ON c.id = t.category_id
      JOIN users u ON u.id = t.user_id
      WHERE t.id = $1
    `, [req.params.id, req.user.id]);
    const topic = rows[0];
    if (!topic) return res.status(404).json({ error: 'Tópico não encontrado.' });
    // Tópico pendente só é visível para o autor ou admin
    if (topic.status !== 'approved' && !isOwnerOrAdmin(req, topic.author_id)) {
      return res.status(404).json({ error: 'Tópico não encontrado.' });
    }

    const { rows: replies } = await db.query(`
      SELECT r.id, r.content, r.image_url, r.created_at, r.updated_at,
        u.id AS author_id, u.name AS author_name, u.avatar_url AS author_avatar,
        (SELECT COUNT(*)::int FROM forum_reply_likes l WHERE l.reply_id = r.id) AS like_count,
        EXISTS(SELECT 1 FROM forum_reply_likes l WHERE l.reply_id = r.id AND l.user_id = $2) AS liked
      FROM forum_replies r
      JOIN users u ON u.id = r.user_id
      WHERE r.topic_id = $1
      ORDER BY r.created_at ASC
    `, [req.params.id, req.user.id]);

    res.json({ ...topic, replies });
  } catch {
    res.status(500).json({ error: 'Erro ao buscar tópico.' });
  }
});

// ── Criar tópico ──
router.post('/topics', upload.single('image'), async (req, res) => {
  try {
    const { category_id, title, content } = req.body;
    if (!category_id || typeof title !== 'string' || typeof content !== 'string') {
      return res.status(400).json({ error: 'Dados inválidos.' });
    }
    if (title.trim().length < 3) return res.status(400).json({ error: 'Título muito curto.' });
    if (content.trim().length < 1) return res.status(400).json({ error: 'Escreva algo no tópico.' });

    const cat = await db.query('SELECT id FROM forum_categories WHERE id = $1', [category_id]);
    if (cat.rows.length === 0) return res.status(400).json({ error: 'Categoria inválida.' });

    let imageUrl = null;
    if (req.file) imageUrl = await uploadFile(req.file, { folder: 'capivari/community' });

    // Posts de usuário comum entram pendentes; admin já publica aprovado
    const status = req.user.role === 'admin' ? 'approved' : 'pending';
    const { rows } = await db.query(`
      INSERT INTO forum_topics (category_id, user_id, title, content, image_url, status)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, status
    `, [category_id, req.user.id, title.trim(), content.trim(), imageUrl, status]);
    res.status(201).json({ id: rows[0].id, status: rows[0].status });
  } catch {
    res.status(500).json({ error: 'Erro ao criar tópico.' });
  }
});

// ── Editar tópico (autor ou admin) ──
router.put('/topics/:id', upload.single('image'), async (req, res) => {
  try {
    const { rows } = await db.query('SELECT user_id FROM forum_topics WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Tópico não encontrado.' });
    if (!isOwnerOrAdmin(req, rows[0].user_id)) return res.status(403).json({ error: 'Sem permissão.' });

    const updates = [];
    const values = [];
    let i = 1;
    if (typeof req.body.title === 'string' && req.body.title.trim()) {
      updates.push(`title = $${i++}`); values.push(req.body.title.trim());
    }
    if (typeof req.body.content === 'string' && req.body.content.trim()) {
      updates.push(`content = $${i++}`); values.push(req.body.content.trim());
    }
    if (req.file) {
      updates.push(`image_url = $${i++}`);
      values.push(await uploadFile(req.file, { folder: 'capivari/community' }));
    }
    if (updates.length === 0) return res.json({ id: Number(req.params.id) });
    updates.push(`updated_at = NOW()`);
    values.push(req.params.id);
    await db.query(`UPDATE forum_topics SET ${updates.join(', ')} WHERE id = $${i}`, values);
    res.json({ id: Number(req.params.id) });
  } catch {
    res.status(500).json({ error: 'Erro ao editar tópico.' });
  }
});

// ── Excluir tópico (autor ou admin) ──
router.delete('/topics/:id', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT user_id FROM forum_topics WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Tópico não encontrado.' });
    if (!isOwnerOrAdmin(req, rows[0].user_id)) return res.status(403).json({ error: 'Sem permissão.' });
    await db.query('DELETE FROM forum_topics WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Erro ao excluir tópico.' });
  }
});

// ── Curtir / descurtir tópico ──
router.post('/topics/:id/like', async (req, res) => {
  try {
    const existing = await db.query(
      'SELECT 1 FROM forum_topic_likes WHERE topic_id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (existing.rows.length > 0) {
      await db.query('DELETE FROM forum_topic_likes WHERE topic_id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    } else {
      await db.query('INSERT INTO forum_topic_likes (topic_id, user_id) VALUES ($1, $2)', [req.params.id, req.user.id]);
    }
    const { rows } = await db.query('SELECT COUNT(*)::int AS n FROM forum_topic_likes WHERE topic_id = $1', [req.params.id]);
    res.json({ liked: existing.rows.length === 0, like_count: rows[0].n });
  } catch {
    res.status(500).json({ error: 'Erro ao curtir.' });
  }
});

// ── Criar resposta ──
router.post('/topics/:id/replies', upload.single('image'), async (req, res) => {
  try {
    const topic = await db.query('SELECT id FROM forum_topics WHERE id = $1', [req.params.id]);
    if (topic.rows.length === 0) return res.status(404).json({ error: 'Tópico não encontrado.' });
    if (typeof req.body.content !== 'string' || req.body.content.trim().length < 1) {
      return res.status(400).json({ error: 'Escreva uma resposta.' });
    }
    let imageUrl = null;
    if (req.file) imageUrl = await uploadFile(req.file, { folder: 'capivari/community' });
    const { rows } = await db.query(`
      INSERT INTO forum_replies (topic_id, user_id, content, image_url)
      VALUES ($1, $2, $3, $4) RETURNING id
    `, [req.params.id, req.user.id, req.body.content.trim(), imageUrl]);
    res.status(201).json({ id: rows[0].id });
  } catch {
    res.status(500).json({ error: 'Erro ao responder.' });
  }
});

// ── Editar resposta ──
router.put('/replies/:id', upload.single('image'), async (req, res) => {
  try {
    const { rows } = await db.query('SELECT user_id FROM forum_replies WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Resposta não encontrada.' });
    if (!isOwnerOrAdmin(req, rows[0].user_id)) return res.status(403).json({ error: 'Sem permissão.' });

    const updates = [];
    const values = [];
    let i = 1;
    if (typeof req.body.content === 'string' && req.body.content.trim()) {
      updates.push(`content = $${i++}`); values.push(req.body.content.trim());
    }
    if (req.file) {
      updates.push(`image_url = $${i++}`);
      values.push(await uploadFile(req.file, { folder: 'capivari/community' }));
    }
    if (updates.length === 0) return res.json({ id: Number(req.params.id) });
    updates.push(`updated_at = NOW()`);
    values.push(req.params.id);
    await db.query(`UPDATE forum_replies SET ${updates.join(', ')} WHERE id = $${i}`, values);
    res.json({ id: Number(req.params.id) });
  } catch {
    res.status(500).json({ error: 'Erro ao editar resposta.' });
  }
});

// ── Excluir resposta ──
router.delete('/replies/:id', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT user_id FROM forum_replies WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Resposta não encontrada.' });
    if (!isOwnerOrAdmin(req, rows[0].user_id)) return res.status(403).json({ error: 'Sem permissão.' });
    await db.query('DELETE FROM forum_replies WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Erro ao excluir resposta.' });
  }
});

// ── Curtir / descurtir resposta ──
router.post('/replies/:id/like', async (req, res) => {
  try {
    const existing = await db.query(
      'SELECT 1 FROM forum_reply_likes WHERE reply_id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (existing.rows.length > 0) {
      await db.query('DELETE FROM forum_reply_likes WHERE reply_id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    } else {
      await db.query('INSERT INTO forum_reply_likes (reply_id, user_id) VALUES ($1, $2)', [req.params.id, req.user.id]);
    }
    const { rows } = await db.query('SELECT COUNT(*)::int AS n FROM forum_reply_likes WHERE reply_id = $1', [req.params.id]);
    res.json({ liked: existing.rows.length === 0, like_count: rows[0].n });
  } catch {
    res.status(500).json({ error: 'Erro ao curtir.' });
  }
});

// ══════════════════════════════════════════════
//  MODERAÇÃO (somente admin)
// ══════════════════════════════════════════════

// Contador de pendências (badge de notificação)
router.get('/moderation/count', requireAdmin, async (req, res) => {
  try {
    const { rows } = await db.query(`SELECT COUNT(*)::int AS pending FROM forum_topics WHERE status = 'pending'`);
    res.json({ pending: rows[0].pending });
  } catch {
    res.status(500).json({ error: 'Erro ao contar pendências.' });
  }
});

// Fila de tópicos pendentes
router.get('/moderation/topics', requireAdmin, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT t.id, t.title, t.content, t.image_url, t.created_at,
        c.name AS category_name, c.slug AS category_slug,
        u.id AS author_id, u.name AS author_name, u.avatar_url AS author_avatar, u.email AS author_email
      FROM forum_topics t
      JOIN forum_categories c ON c.id = t.category_id
      JOIN users u ON u.id = t.user_id
      WHERE t.status = 'pending'
      ORDER BY t.created_at ASC
    `);
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Erro ao buscar pendências.' });
  }
});

// Aprovar tópico → libera na comunidade
router.post('/moderation/topics/:id/approve', requireAdmin, async (req, res) => {
  try {
    const { rowCount } = await db.query(
      `UPDATE forum_topics SET status = 'approved', updated_at = NOW() WHERE id = $1 AND status = 'pending'`,
      [req.params.id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Tópico não encontrado ou já moderado.' });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Erro ao aprovar.' });
  }
});

// Rejeitar tópico → remove
router.post('/moderation/topics/:id/reject', requireAdmin, async (req, res) => {
  try {
    const { rowCount } = await db.query(`DELETE FROM forum_topics WHERE id = $1 AND status = 'pending'`, [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Tópico não encontrado ou já moderado.' });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Erro ao rejeitar.' });
  }
});

module.exports = router;
