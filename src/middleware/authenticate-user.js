const jwt = require('jsonwebtoken');
const env = require('../config/env');

// Igual ao authenticate, mas permite qualquer usuário logado (role 'user' ou 'admin').
// Usado nas rotas da área de comunidade / perfil.
function authenticateUser(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token ausente ou inválido.' });
  }

  const token = header.split(' ')[1];

  if (!token || token === 'null' || token === 'undefined' || token.split('.').length !== 3) {
    return res.status(401).json({ error: 'Formato de token inválido.' });
  }

  try {
    req.user = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido.' });
  }
}

module.exports = authenticateUser;
