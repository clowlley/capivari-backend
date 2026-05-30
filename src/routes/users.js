const express = require('express');
const router = express.Router();
const db = require('../db');
const authenticateUser = require('../middleware/authenticate-user');
const optionalAuth = require('../middleware/optional-auth');
const createUserRateLimit = require('../middleware/user-rate-limit');

const followLimiter = createUserRateLimit({ windowMs: 60 * 1000, max: 40, message: 'Muitas ações seguidas. Aguarde um instante.' });

// ── Perfil público de um usuário ──
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const viewer = req.user?.id || 0;
    const { rows } = await db.query(`
      SELECT u.id, u.name, u.avatar_url, u.bio, u.role, u.created_at,
        (SELECT COUNT(*)::int FROM forum_topics t WHERE t.user_id = u.id AND t.status = 'approved') AS topic_count,
        (SELECT COUNT(*)::int FROM forum_replies r WHERE r.user_id = u.id) AS reply_count,
        (SELECT COUNT(*)::int FROM user_follows f WHERE f.following_id = u.id) AS follower_count,
        (SELECT COUNT(*)::int FROM user_follows f WHERE f.follower_id = u.id) AS following_count,
        EXISTS(SELECT 1 FROM user_follows f WHERE f.following_id = u.id AND f.follower_id = $2) AS is_following
      FROM users u
      WHERE u.id = $1
    `, [req.params.id, viewer]);
    const profile = rows[0];
    if (!profile) return res.status(404).json({ error: 'Usuário não encontrado.' });
    res.json(profile);
  } catch {
    res.status(500).json({ error: 'Erro ao buscar perfil.' });
  }
});

// ── Tópicos aprovados de um usuário ──
router.get('/:id/topics', optionalAuth, async (req, res) => {
  try {
    const viewer = req.user?.id || 0;
    const { rows } = await db.query(`
      SELECT t.id, t.title, t.content, t.image_url, t.created_at, t.updated_at,
        c.id AS category_id, c.name AS category_name, c.slug AS category_slug,
        u.id AS author_id, u.name AS author_name, u.avatar_url AS author_avatar,
        (SELECT COUNT(*)::int FROM forum_replies r WHERE r.topic_id = t.id) AS reply_count,
        (SELECT COUNT(*)::int FROM forum_topic_likes l WHERE l.topic_id = t.id) AS like_count,
        EXISTS(SELECT 1 FROM forum_topic_likes l WHERE l.topic_id = t.id AND l.user_id = $2) AS liked
      FROM forum_topics t
      JOIN forum_categories c ON c.id = t.category_id
      JOIN users u ON u.id = t.user_id
      WHERE t.user_id = $1 AND t.status = 'approved'
      ORDER BY t.created_at DESC
    `, [req.params.id, viewer]);
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Erro ao buscar tópicos.' });
  }
});

// ── Seguir / deixar de seguir ──
router.post('/:id/follow', authenticateUser, followLimiter, async (req, res) => {
  try {
    const targetId = Number(req.params.id);
    if (!Number.isInteger(targetId)) return res.status(400).json({ error: 'Usuário inválido.' });
    if (targetId === req.user.id) return res.status(400).json({ error: 'Você não pode seguir a si mesmo.' });

    const target = await db.query('SELECT 1 FROM users WHERE id = $1', [targetId]);
    if (target.rows.length === 0) return res.status(404).json({ error: 'Usuário não encontrado.' });

    const existing = await db.query(
      'SELECT 1 FROM user_follows WHERE follower_id = $1 AND following_id = $2',
      [req.user.id, targetId]
    );
    if (existing.rows.length > 0) {
      await db.query('DELETE FROM user_follows WHERE follower_id = $1 AND following_id = $2', [req.user.id, targetId]);
    } else {
      await db.query('INSERT INTO user_follows (follower_id, following_id) VALUES ($1, $2)', [req.user.id, targetId]);
    }
    const { rows } = await db.query('SELECT COUNT(*)::int AS n FROM user_follows WHERE following_id = $1', [targetId]);
    res.json({ following: existing.rows.length === 0, follower_count: rows[0].n });
  } catch {
    res.status(500).json({ error: 'Erro ao seguir usuário.' });
  }
});

module.exports = router;
