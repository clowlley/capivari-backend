const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../db');
const env = require('../config/env');
const authenticate = require('../middleware/authenticate');
const rateLimit = require('../middleware/rateLimit');

// Hash dummy gerado uma vez para garantir tempo constante quando o e-mail não existe
const DUMMY_HASH = bcrypt.hashSync('dummy-password-not-used', 10);

router.post('/login', rateLimit, async (req, res) => {
  const { email, password } = req.body;
  try {
    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Credenciais inválidas.' });
    }

    const { rows } = await db.query(
      'SELECT id, email, password, name, role FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );
    const user = rows[0];

    // Sempre executa bcrypt — mesmo se user não existir — para mitigar timing attack
    const hashToCompare = user ? user.password : DUMMY_HASH;
    const passwordOk = bcrypt.compareSync(password, hashToCompare);

    if (!user || !passwordOk) {
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    rateLimit.resetAttempts(req);

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN, algorithm: 'HS256' }
    );
    res.json({ token, admin: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (error) {
    res.status(500).json({ error: 'Erro de autenticação.' });
  }
});

router.get('/me', authenticate, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT id, email, name, role FROM users WHERE id = $1', [req.user.id]);
    const user = rows[0];
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
    res.json(user);
  } catch {
    res.status(500).json({ error: 'Erro ao buscar usuário.' });
  }
});

module.exports = router;