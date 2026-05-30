const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../db');
const env = require('../config/env');
const authenticateUser = require('../middleware/authenticate-user');
const rateLimit = require('../middleware/rateLimit');
const upload = require('../middleware/upload');
const { uploadFile } = require('../lib/cloudinary');

// Hash dummy gerado uma vez para garantir tempo constante quando o e-mail não existe
const DUMMY_HASH = bcrypt.hashSync('dummy-password-not-used', 10);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN, algorithm: 'HS256' }
  );
}

const MAX_BIO = 500;

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    avatar_url: user.avatar_url || null,
    bio: user.bio || null,
  };
}

router.post('/login', rateLimit, async (req, res) => {
  const { email, password } = req.body;
  try {
    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Credenciais inválidas.' });
    }

    const { rows } = await db.query(
      'SELECT id, email, password, name, role, avatar_url, bio FROM users WHERE email = $1',
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

    const token = signToken(user);
    res.json({ token, admin: publicUser(user) });
  } catch (error) {
    res.status(500).json({ error: 'Erro de autenticação.' });
  }
});

// Registro público — sempre cria usuário com role 'user'
router.post('/register', rateLimit, async (req, res) => {
  const { name, email, password } = req.body;
  try {
    if (typeof name !== 'string' || typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Dados inválidos.' });
    }
    const cleanName = name.trim();
    const cleanEmail = email.toLowerCase().trim();

    if (cleanName.length < 2) {
      return res.status(400).json({ error: 'Informe seu nome.' });
    }
    if (!EMAIL_RE.test(cleanEmail)) {
      return res.status(400).json({ error: 'E-mail inválido.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'A senha deve ter no mínimo 6 caracteres.' });
    }

    const exists = await db.query('SELECT id FROM users WHERE email = $1', [cleanEmail]);
    if (exists.rows.length > 0) {
      return res.status(409).json({ error: 'Este e-mail já está cadastrado.' });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    const { rows } = await db.query(
      `INSERT INTO users (email, password, name, role)
       VALUES ($1, $2, $3, 'user')
       RETURNING id, email, name, role, avatar_url, bio`,
      [cleanEmail, hashedPassword, cleanName]
    );
    const user = rows[0];

    rateLimit.resetAttempts(req);
    const token = signToken(user);
    res.status(201).json({ token, admin: publicUser(user) });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao criar conta.' });
  }
});

router.get('/me', authenticateUser, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT id, email, name, role, avatar_url, bio FROM users WHERE id = $1',
      [req.user.id]
    );
    const user = rows[0];
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
    res.json(publicUser(user));
  } catch {
    res.status(500).json({ error: 'Erro ao buscar usuário.' });
  }
});

// Atualização de perfil — nome, e-mail, senha e foto (qualquer usuário logado)
router.put('/me', authenticateUser, upload.single('avatar'), async (req, res) => {
  try {
    const { rows: current } = await db.query(
      'SELECT id, email, password, name, role, avatar_url, bio FROM users WHERE id = $1',
      [req.user.id]
    );
    const user = current[0];
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

    const updates = [];
    const values = [];
    let i = 1;

    if (typeof req.body.name === 'string' && req.body.name.trim()) {
      const cleanName = req.body.name.trim();
      if (cleanName.length < 2) return res.status(400).json({ error: 'Nome inválido.' });
      updates.push(`name = $${i++}`);
      values.push(cleanName);
    }

    if (typeof req.body.email === 'string' && req.body.email.trim()) {
      const cleanEmail = req.body.email.toLowerCase().trim();
      if (!EMAIL_RE.test(cleanEmail)) return res.status(400).json({ error: 'E-mail inválido.' });
      if (cleanEmail !== user.email) {
        const dup = await db.query('SELECT id FROM users WHERE email = $1 AND id <> $2', [cleanEmail, user.id]);
        if (dup.rows.length > 0) return res.status(409).json({ error: 'Este e-mail já está em uso.' });
        updates.push(`email = $${i++}`);
        values.push(cleanEmail);
      }
    }

    // Troca de senha exige senha atual
    if (typeof req.body.newPassword === 'string' && req.body.newPassword.length > 0) {
      if (req.body.newPassword.length < 6) {
        return res.status(400).json({ error: 'A nova senha deve ter no mínimo 6 caracteres.' });
      }
      const currentOk = bcrypt.compareSync(req.body.currentPassword || '', user.password);
      if (!currentOk) {
        return res.status(401).json({ error: 'Senha atual incorreta.' });
      }
      updates.push(`password = $${i++}`);
      values.push(bcrypt.hashSync(req.body.newPassword, 10));
    }

    if (typeof req.body.bio === 'string') {
      const cleanBio = req.body.bio.trim();
      if (cleanBio.length > MAX_BIO) return res.status(400).json({ error: `Bio longa demais (máx ${MAX_BIO}).` });
      updates.push(`bio = $${i++}`);
      values.push(cleanBio || null);
    }

    if (req.file) {
      const avatarUrl = await uploadFile(req.file, { folder: 'capivari/avatars' });
      updates.push(`avatar_url = $${i++}`);
      values.push(avatarUrl);
    }

    if (updates.length === 0) {
      return res.json(publicUser(user));
    }

    values.push(user.id);
    const { rows } = await db.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${i} RETURNING id, email, name, role, avatar_url, bio`,
      values
    );
    res.json(publicUser(rows[0]));
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar perfil.' });
  }
});

module.exports = router;
