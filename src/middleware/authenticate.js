const jwt = require('jsonwebtoken');
const env = require('../config/env');

function authenticate(req, res, next) {
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
    if (req.user.role && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Acesso negado.' });
    }
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido.' });
  }
}

module.exports = authenticate;