const db = require('../db');

// Cria uma notificação. Ignora silenciosamente se o destinatário for o próprio ator
// ou em caso de erro (não deve quebrar a ação principal).
async function createNotification({ userId, actorId, type, topicId = null, replyId = null }) {
  try {
    if (!userId || !type) return;
    if (actorId && Number(userId) === Number(actorId)) return;
    await db.query(
      `INSERT INTO notifications (user_id, actor_id, type, topic_id, reply_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, actorId || null, type, topicId, replyId]
    );
  } catch (e) {
    console.error('[notify]', e?.message);
  }
}

module.exports = { createNotification };
