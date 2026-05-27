const express = require('express');
const cors = require('cors');
const path = require('path');
const env = require('./config/env');

const app = express();

if (env.TRUST_PROXY) app.set('trust proxy', 1);

app.disable('x-powered-by');

// Security headers globais (substitui helmet — middleware manual)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

const allowedOrigins = (env.FRONTEND_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origem não permitida pelo CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 600,
}));

app.use(express.json({ limit: '100kb' }));
app.use(
  '/uploads',
  cors({ origin: '*' }),
  express.static(path.join(__dirname, '../../uploads'), {
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; media-src 'self'");
    },
  })
);

// Importação de rotas
app.use('/api/auth', require('./routes/auth'));
app.use('/api/events', require('./routes/events'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/admin/financial', require('./routes/financial'));
app.use('/api/admin/tasks', require('./routes/tasks'));
app.use('/api/gallery', require('./routes/gallery'));
app.use('/api/products', require('./routes/products'));
app.use('/api/artists', require('./routes/artists'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/admin', require('./routes/nlista'));
app.use('/api/contact', require('./routes/contact'));
app.use('/api/displays', require('./routes/displays'));

// Rota de ping para teste

app.get('/api/ping', (req, res) => res.json({ message: 'pong' }));

// Error handler global — captura erros do multer/cloudinary que escapam dos handlers
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  console.error('[global error]', err?.code, err?.field, err?.message);
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Arquivo grande demais (máx 25MB)' });
  }
  if (err?.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ error: `Campo de arquivo inesperado: ${err.field || ''}` });
  }
  if (err?.message?.startsWith('Extensão não permitida') || err?.message?.startsWith('Tipo MIME')) {
    return res.status(400).json({ error: err.message });
  }
  res.status(500).json({ error: err?.message || 'Erro interno' });
});

module.exports = app;