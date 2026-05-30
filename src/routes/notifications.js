const express = require('express');
const router = express.Router();
const db = require('../db');
const authenticateUser = require('../middleware/authenticate-user');

// ── Listar notificações do usuário logado ──
router.get('/', authenticateUser, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT n.id, n.type, n.topic_id, n.reply_id, n.read, n.created_at,
        a.id AS actor_id, a.name AS actor_name, a.avatar_url AS actor_avatar,
        t.title AS topic_title
      FROM notifications n
      LEFT JOIN users a ON a.id = n.actor_id
      LEFT JOIN forum_topics t ON t.id = n.topic_id
      WHERE n.user_id = $1
      ORDER BY n.created_at DESC
      LIMIT 40
    `, [req.user.id]);
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Erro ao buscar notificações.' });
  }
});

// ── Contador de não lidas (badge) ──
router.get('/count', authenticateUser, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT COUNT(*)::int AS unread FROM notifications WHERE user_id = $1 AND read = false',
      [req.user.id]
    );
    res.json({ unread: rows[0].unread });
  } catch {
    res.status(500).json({ error: 'Erro ao contar notificações.' });
  }
});

// ── Marcar todas como lidas ──
router.post('/read-all', authenticateUser, async (req, res) => {
  try {
    await db.query('UPDATE notifications SET read = true WHERE user_id = $1 AND read = false', [req.user.id]);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Erro ao marcar notificações.' });
  }
});

module.exports = router;
