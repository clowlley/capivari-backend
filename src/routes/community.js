const express = require('express');
const router = express.Router();
const db = require('../db');
const authenticateUser = require('../middleware/authenticate-user');
const optionalAuth = require('../middleware/optional-auth');
const upload = require('../middleware/upload');
const createUserRateLimit = require('../middleware/user-rate-limit');
const { uploadFile } = require('../lib/cloudinary');

// Leitura é pública (optionalAuth); escrita/curtida/moderação exigem login (authenticateUser).

// Limites de conteúdo (anti-spam / sanidade)
const MAX_TITLE = 160;
const MAX_TOPIC_CONTENT = 20000; // post
const MAX_REPLY_CONTENT = 10000; // comentário

// Limitadores anti-spam por usuário
const topicLimiter = createUserRateLimit({ windowMs: 10 * 60 * 1000, max: 6, message: 'Você criou tópicos demais. Aguarde alguns minutos.' });
const replyLimiter = createUserRateLimit({ windowMs: 10 * 60 * 1000, max: 25, message: 'Você enviou respostas demais. Aguarde um momento.' });
const likeLimiter = createUserRateLimit({ windowMs: 60 * 1000, max: 50, message: 'Muitas ações seguidas. Aguarde um instante.' });

function isOwnerOrAdmin(req, ownerId) {
  return req.user.id === ownerId || req.user.role === 'admin';
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acesso negado.' });
  next();
}

const ACCENTS = new RegExp('[\\u0300-\\u036f]', 'g');
function slugify(s) {
  return String(s)
    .normalize('NFD').replace(ACCENTS, '') // remove acentos
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function uniqueSlug(base) {
  const root = base || 'categoria';
  let slug = root;
  let n = 1;
  // eslint-disable-next-line no-await-in-loop
  while ((await db.query('SELECT 1 FROM forum_categories WHERE slug = $1', [slug])).rows.length) {
    n += 1;
    slug = `${root}-${n}`;
  }
  return slug;
}

// ── Categorias ──
router.get('/categories', optionalAuth, async (req, res) => {
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
router.get('/topics', optionalAuth, async (req, res) => {
  try {
    const { category } = req.query;
    const params = [req.user?.id || 0];
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
router.get('/topics/:id', optionalAuth, async (req, res) => {
  try {
    const uid = req.user?.id || 0;
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
    `, [req.params.id, uid]);
    const topic = rows[0];
    if (!topic) return res.status(404).json({ error: 'Tópico não encontrado.' });
    // Tópico pendente só é visível para o autor ou admin
    if (topic.status !== 'approved' && !(req.user && isOwnerOrAdmin(req, topic.author_id))) {
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
    `, [req.params.id, uid]);

    res.json({ ...topic, replies });
  } catch {
    res.status(500).json({ error: 'Erro ao buscar tópico.' });
  }
});

// ── Membros mais ativos (ranking por contribuições) ──
router.get('/members/active', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT u.id, u.name, u.avatar_url,
        (
          (SELECT COUNT(*) FROM forum_topics t WHERE t.user_id = u.id AND t.status = 'approved')
          + (SELECT COUNT(*) FROM forum_replies r WHERE r.user_id = u.id)
        )::int AS contributions
      FROM users u
      WHERE EXISTS (SELECT 1 FROM forum_topics t WHERE t.user_id = u.id AND t.status = 'approved')
         OR EXISTS (SELECT 1 FROM forum_replies r WHERE r.user_id = u.id)
      ORDER BY contributions DESC, u.name ASC
      LIMIT 8
    `);
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Erro ao buscar membros.' });
  }
});

// ── Criar tópico ──
router.post('/topics', authenticateUser, topicLimiter, upload.single('image'), async (req, res) => {
  try {
    const { category_id, title, content } = req.body;
    if (!category_id || typeof title !== 'string' || typeof content !== 'string') {
      return res.status(400).json({ error: 'Dados inválidos.' });
    }
    if (title.trim().length < 3) return res.status(400).json({ error: 'Título muito curto.' });
    if (title.trim().length > MAX_TITLE) return res.status(400).json({ error: `Título longo demais (máx ${MAX_TITLE}).` });
    if (content.trim().length < 1) return res.status(400).json({ error: 'Escreva algo no tópico.' });
    if (content.trim().length > MAX_TOPIC_CONTENT) return res.status(400).json({ error: `Texto longo demais (máx ${MAX_TOPIC_CONTENT} caracteres).` });

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
router.put('/topics/:id', authenticateUser, upload.single('image'), async (req, res) => {
  try {
    const { rows } = await db.query('SELECT user_id FROM forum_topics WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Tópico não encontrado.' });
    if (!isOwnerOrAdmin(req, rows[0].user_id)) return res.status(403).json({ error: 'Sem permissão.' });

    const updates = [];
    const values = [];
    let i = 1;
    if (typeof req.body.title === 'string' && req.body.title.trim()) {
      if (req.body.title.trim().length > MAX_TITLE) return res.status(400).json({ error: `Título longo demais (máx ${MAX_TITLE}).` });
      updates.push(`title = $${i++}`); values.push(req.body.title.trim());
    }
    if (typeof req.body.content === 'string' && req.body.content.trim()) {
      if (req.body.content.trim().length > MAX_TOPIC_CONTENT) return res.status(400).json({ error: `Texto longo demais (máx ${MAX_TOPIC_CONTENT} caracteres).` });
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
router.delete('/topics/:id', authenticateUser, async (req, res) => {
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
router.post('/topics/:id/like', authenticateUser, likeLimiter, async (req, res) => {
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
router.post('/topics/:id/replies', authenticateUser, replyLimiter, upload.single('image'), async (req, res) => {
  try {
    const topic = await db.query('SELECT id FROM forum_topics WHERE id = $1', [req.params.id]);
    if (topic.rows.length === 0) return res.status(404).json({ error: 'Tópico não encontrado.' });
    if (typeof req.body.content !== 'string' || req.body.content.trim().length < 1) {
      return res.status(400).json({ error: 'Escreva uma resposta.' });
    }
    if (req.body.content.trim().length > MAX_REPLY_CONTENT) {
      return res.status(400).json({ error: `Resposta longa demais (máx ${MAX_REPLY_CONTENT} caracteres).` });
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
router.put('/replies/:id', authenticateUser, upload.single('image'), async (req, res) => {
  try {
    const { rows } = await db.query('SELECT user_id FROM forum_replies WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Resposta não encontrada.' });
    if (!isOwnerOrAdmin(req, rows[0].user_id)) return res.status(403).json({ error: 'Sem permissão.' });

    const updates = [];
    const values = [];
    let i = 1;
    if (typeof req.body.content === 'string' && req.body.content.trim()) {
      if (req.body.content.trim().length > MAX_REPLY_CONTENT) return res.status(400).json({ error: `Resposta longa demais (máx ${MAX_REPLY_CONTENT} caracteres).` });
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
router.delete('/replies/:id', authenticateUser, async (req, res) => {
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
router.post('/replies/:id/like', authenticateUser, likeLimiter, async (req, res) => {
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
//  CATEGORIAS — admin (criar / editar / excluir)
// ══════════════════════════════════════════════

router.post('/categories', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const { name, description, position } = req.body;
    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Informe o nome da categoria.' });
    }
    if (name.trim().length > 120) return res.status(400).json({ error: 'Nome longo demais (máx 120).' });

    const slug = await uniqueSlug(slugify(name));
    const pos = position != null && !Number.isNaN(Number(position))
      ? Number(position)
      : (await db.query('SELECT COALESCE(MAX(position), 0) + 1 AS p FROM forum_categories')).rows[0].p;

    const { rows } = await db.query(
      'INSERT INTO forum_categories (name, slug, description, position) VALUES ($1, $2, $3, $4) RETURNING *',
      [name.trim(), slug, (typeof description === 'string' && description.trim()) || null, pos]
    );
    res.status(201).json(rows[0]);
  } catch {
    res.status(500).json({ error: 'Erro ao criar categoria.' });
  }
});

router.put('/categories/:id', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const updates = [];
    const values = [];
    let i = 1;
    if (typeof req.body.name === 'string' && req.body.name.trim()) {
      if (req.body.name.trim().length > 120) return res.status(400).json({ error: 'Nome longo demais (máx 120).' });
      updates.push(`name = $${i++}`); values.push(req.body.name.trim());
    }
    if (typeof req.body.description === 'string') {
      updates.push(`description = $${i++}`); values.push(req.body.description.trim() || null);
    }
    if (req.body.position != null && !Number.isNaN(Number(req.body.position))) {
      updates.push(`position = $${i++}`); values.push(Number(req.body.position));
    }
    if (updates.length === 0) return res.status(400).json({ error: 'Nada para atualizar.' });
    values.push(req.params.id);
    const { rows } = await db.query(
      `UPDATE forum_categories SET ${updates.join(', ')} WHERE id = $${i} RETURNING *`,
      values
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Categoria não encontrada.' });
    res.json(rows[0]);
  } catch {
    res.status(500).json({ error: 'Erro ao editar categoria.' });
  }
});

// Excluir categoria (apaga em cascata os tópicos da categoria)
router.delete('/categories/:id', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const { rowCount } = await db.query('DELETE FROM forum_categories WHERE id = $1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Categoria não encontrada.' });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Erro ao excluir categoria.' });
  }
});

// ══════════════════════════════════════════════
//  MODERAÇÃO (somente admin)
// ══════════════════════════════════════════════

// Contador de pendências (badge de notificação)
router.get('/moderation/count', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const { rows } = await db.query(`SELECT COUNT(*)::int AS pending FROM forum_topics WHERE status = 'pending'`);
    res.json({ pending: rows[0].pending });
  } catch {
    res.status(500).json({ error: 'Erro ao contar pendências.' });
  }
});

// Fila de tópicos pendentes
router.get('/moderation/topics', authenticateUser, requireAdmin, async (req, res) => {
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
router.post('/moderation/topics/:id/approve', authenticateUser, requireAdmin, async (req, res) => {
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
router.post('/moderation/topics/:id/reject', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const { rowCount } = await db.query(`DELETE FROM forum_topics WHERE id = $1 AND status = 'pending'`, [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Tópico não encontrado ou já moderado.' });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Erro ao rejeitar.' });
  }
});

function parseIds(body) {
  return Array.isArray(body?.ids)
    ? [...new Set(body.ids.map(Number).filter((n) => Number.isInteger(n) && n > 0))]
    : [];
}

// Aprovar em massa
router.post('/moderation/topics/bulk-approve', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const ids = parseIds(req.body);
    if (ids.length === 0) return res.status(400).json({ error: 'Nenhum tópico selecionado.' });
    const { rowCount } = await db.query(
      `UPDATE forum_topics SET status = 'approved', updated_at = NOW() WHERE id = ANY($1) AND status = 'pending'`,
      [ids]
    );
    res.json({ approved: rowCount });
  } catch {
    res.status(500).json({ error: 'Erro ao aprovar em massa.' });
  }
});

// Rejeitar em massa
router.post('/moderation/topics/bulk-reject', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const ids = parseIds(req.body);
    if (ids.length === 0) return res.status(400).json({ error: 'Nenhum tópico selecionado.' });
    const { rowCount } = await db.query(
      `DELETE FROM forum_topics WHERE id = ANY($1) AND status = 'pending'`,
      [ids]
    );
    res.json({ rejected: rowCount });
  } catch {
    res.status(500).json({ error: 'Erro ao rejeitar em massa.' });
  }
});

module.exports = router;
