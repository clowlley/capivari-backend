const express = require('express');
const router = express.Router();
const db = require('../db');
const authenticate = require('../middleware/authenticate');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[\d\s()+\-]{8,20}$/;

const LIMITS = {
  nome: 120,
  email: 160,
  telefone: 30,
  assunto: 200,
  mensagem: 2000,
};

function str(v, max) {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
}

// Public: submit contact message
router.post('/', async (req, res) => {
  const nome = str(req.body?.nome, LIMITS.nome);
  const email = str(req.body?.email, LIMITS.email);
  const assunto = str(req.body?.assunto, LIMITS.assunto);
  const mensagem = str(req.body?.mensagem, LIMITS.mensagem);
  const telefoneRaw = req.body?.telefone;

  if (!nome || !email || !assunto || !mensagem) {
    return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
  }
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'E-mail inválido.' });
  }

  let telefone = null;
  if (telefoneRaw !== undefined && telefoneRaw !== null && telefoneRaw !== '') {
    const t = str(telefoneRaw, LIMITS.telefone);
    if (!t || !PHONE_RE.test(t)) {
      return res.status(400).json({ error: 'Telefone inválido.' });
    }
    telefone = t;
  }

  try {
    const { rows } = await db.query(
      `INSERT INTO contact_messages (nome, email, telefone, assunto, mensagem)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [nome, email.toLowerCase(), telefone, assunto, mensagem]
    );
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao salvar mensagem.' });
  }
});

// Admin: list messages
router.get('/admin', authenticate, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM contact_messages ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar mensagens.' });
  }
});

// Admin: mark as read
router.patch('/admin/:id/read', authenticate, async (req, res) => {
  try {
    await db.query(
      `UPDATE contact_messages SET lido = true WHERE id = $1`,
      [req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar mensagem.' });
  }
});

// Admin: delete
router.delete('/admin/:id', authenticate, async (req, res) => {
  try {
    await db.query(`DELETE FROM contact_messages WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao deletar mensagem.' });
  }
});

module.exports = router;
