const router = require('express').Router();
const db = require('../db/index');
const authenticate = require('../middleware/authenticate');

const YOUTUBE_RE = /^https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)[\w\-]{6,}/i;
const SCREEN_CODE_RE = /^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/i;

const LIMITS = {
  name: 120,
  screen_code: 60,
  youtube_url: 500,
};

function str(v, max) {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t || t.length > max) return null;
  return t;
}

// ─── Realtime (SSE) ────────────────────────────────────────────
// Map<screenCode, Set<res>>
const subscribers = new Map();

function broadcast(screenCode, event, data) {
  const set = subscribers.get(screenCode);
  if (!set) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) {
    try { res.write(payload); } catch { /* ignored */ }
  }
}

// ─── Público: buscar display por screenCode ────────────────────
router.get('/by-code/:screenCode', async (req, res) => {
  try {
    const code = String(req.params.screenCode || '').toLowerCase().trim();
    if (!SCREEN_CODE_RE.test(code)) {
      return res.status(400).json({ error: 'screenCode inválido' });
    }
    const { rows } = await db.query(
      'SELECT id, name, screen_code, youtube_url, loop, autoplay, fullscreen FROM displays WHERE screen_code = $1',
      [code]
    );
    if (!rows.length) return res.status(404).json({ error: 'Tela não encontrada' });
    res.json(rows[0]);
  } catch {
    res.status(500).json({ error: 'Erro ao buscar tela' });
  }
});

// ─── Público: SSE stream para a tela receber updates ───────────
router.get('/stream/:screenCode', async (req, res) => {
  const code = String(req.params.screenCode || '').toLowerCase().trim();
  if (!SCREEN_CODE_RE.test(code)) {
    return res.status(400).end();
  }

  const { rows } = await db.query('SELECT id FROM displays WHERE screen_code = $1', [code]);
  if (!rows.length) return res.status(404).end();
  const displayId = rows[0].id;

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();
  res.write(': connected\n\n');

  if (!subscribers.has(code)) subscribers.set(code, new Set());
  subscribers.get(code).add(res);

  // marca online
  await db.query('UPDATE displays SET last_seen = NOW() WHERE id = $1', [displayId]);

  const heartbeat = setInterval(() => {
    try {
      res.write(': ping\n\n');
      db.query('UPDATE displays SET last_seen = NOW() WHERE id = $1', [displayId]).catch(() => {});
    } catch { /* ignored */ }
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    const set = subscribers.get(code);
    if (set) {
      set.delete(res);
      if (set.size === 0) subscribers.delete(code);
    }
  });
});

// ─── Admin: listar todas as telas ──────────────────────────────
router.get('/admin', authenticate, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, name, screen_code, youtube_url, loop, autoplay, fullscreen,
              last_seen, created_at, updated_at,
              (last_seen IS NOT NULL AND last_seen > NOW() - INTERVAL '60 seconds') AS online
       FROM displays ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Erro ao buscar telas' });
  }
});

// ─── Admin: criar ──────────────────────────────────────────────
router.post('/admin', authenticate, async (req, res) => {
  try {
    const name = str(req.body?.name, LIMITS.name);
    const screen_code = str(req.body?.screen_code, LIMITS.screen_code)?.toLowerCase();
    const youtube_url = str(req.body?.youtube_url, LIMITS.youtube_url);
    const loop = req.body?.loop !== false;
    const autoplay = req.body?.autoplay !== false;
    const fullscreen = req.body?.fullscreen !== false;

    if (!name) return res.status(400).json({ error: 'Nome obrigatório' });
    if (!screen_code || !SCREEN_CODE_RE.test(screen_code)) {
      return res.status(400).json({ error: 'screen_code inválido (use letras, números e hífen, 3-60 chars)' });
    }
    if (!youtube_url || !YOUTUBE_RE.test(youtube_url)) {
      return res.status(400).json({ error: 'URL do YouTube inválida' });
    }

    const { rows } = await db.query(
      `INSERT INTO displays (name, screen_code, youtube_url, loop, autoplay, fullscreen)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name, screen_code, youtube_url, loop, autoplay, fullscreen]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'screen_code já existe' });
    }
    res.status(500).json({ error: 'Erro ao criar tela' });
  }
});

// ─── Admin: atualizar ──────────────────────────────────────────
router.put('/admin/:id', authenticate, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'id inválido' });

    const name = str(req.body?.name, LIMITS.name);
    const screen_code = str(req.body?.screen_code, LIMITS.screen_code)?.toLowerCase();
    const youtube_url = str(req.body?.youtube_url, LIMITS.youtube_url);

    if (!name) return res.status(400).json({ error: 'Nome obrigatório' });
    if (!screen_code || !SCREEN_CODE_RE.test(screen_code)) {
      return res.status(400).json({ error: 'screen_code inválido' });
    }
    if (!youtube_url || !YOUTUBE_RE.test(youtube_url)) {
      return res.status(400).json({ error: 'URL do YouTube inválida' });
    }

    const loop = req.body?.loop !== false;
    const autoplay = req.body?.autoplay !== false;
    const fullscreen = req.body?.fullscreen !== false;

    const { rows } = await db.query(
      `UPDATE displays SET name=$1, screen_code=$2, youtube_url=$3,
                           loop=$4, autoplay=$5, fullscreen=$6, updated_at=NOW()
       WHERE id=$7 RETURNING *`,
      [name, screen_code, youtube_url, loop, autoplay, fullscreen, id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Tela não encontrada' });

    // notifica display conectado
    broadcast(rows[0].screen_code, 'update', {
      youtube_url: rows[0].youtube_url,
      loop: rows[0].loop,
      autoplay: rows[0].autoplay,
      fullscreen: rows[0].fullscreen,
    });

    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'screen_code já existe' });
    }
    res.status(500).json({ error: 'Erro ao atualizar tela' });
  }
});

// ─── Admin: excluir ────────────────────────────────────────────
router.delete('/admin/:id', authenticate, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'id inválido' });

    const { rows } = await db.query(
      'DELETE FROM displays WHERE id = $1 RETURNING screen_code',
      [id]
    );
    if (rows.length) {
      broadcast(rows[0].screen_code, 'deleted', {});
      const set = subscribers.get(rows[0].screen_code);
      if (set) {
        for (const res of set) { try { res.end(); } catch { /* ignored */ } }
        subscribers.delete(rows[0].screen_code);
      }
    }
    res.status(204).send();
  } catch {
    res.status(500).json({ error: 'Erro ao excluir tela' });
  }
});

module.exports = router;
