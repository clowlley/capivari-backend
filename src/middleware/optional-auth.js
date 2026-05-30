const jwt = require('jsonwebtoken');
const env = require('../config/env');

// Se houver token válido, popula req.user; caso contrário segue como visitante (req.user = null).
// Usado em rotas de leitura pública que ainda querem saber se o visitante curtiu algo.
function optionalAuth(req, _res, next) {
  req.user = null;
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    const token = header.split(' ')[1];
    if (token && token !== 'null' && token !== 'undefined' && token.split('.').length === 3) {
      try {
        req.user = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
      } catch {
        req.user = null;
      }
    }
  }
  next();
}

module.exports = optionalAuth;
