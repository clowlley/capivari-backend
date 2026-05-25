const dotenv = require('dotenv');
dotenv.config();

const env = {
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '2h',
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'admin@capivari.local',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
  ADMIN_NAME: process.env.ADMIN_NAME || 'Admin Capivari',
  FRONTEND_ORIGIN: process.env.FRONTEND_ORIGIN || 'http://localhost:5173',
  TRUST_PROXY: process.env.TRUST_PROXY === 'true',
  PORT: process.env.PORT || 3002,
  LOGIN_RATE_WINDOW_MS: Number(process.env.LOGIN_RATE_WINDOW_MS || 10 * 60 * 1000),
  LOGIN_RATE_MAX_ATTEMPTS: Number(process.env.LOGIN_RATE_MAX_ATTEMPTS || 5),
  LOGIN_BAN_MS: Number(process.env.LOGIN_BAN_MS || 10 * 60 * 1000),
};

// Validação de variáveis obrigatórias
const required = ['JWT_SECRET', 'ADMIN_PASSWORD'];
required.forEach((key) => {
  if (!env[key]) {
    console.error(`Erro: Variável de ambiente ${key} é obrigatória.`);
    process.exit(1);
  }
});

// Validação de força — rejeita placeholders conhecidos e segredos fracos
const WEAK_SECRETS = [
  'replace-me-with-a-secure-secret',
  'change-me', 'changeme', 'secret', 'default', 'jwt-secret',
  'your-secret-key', 'mysecret', 'password',
];

if (env.JWT_SECRET.length < 32) {
  console.error('Erro: JWT_SECRET deve ter no mínimo 32 caracteres.');
  console.error('Gere um seguro: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"');
  process.exit(1);
}
if (WEAK_SECRETS.includes(env.JWT_SECRET.toLowerCase())) {
  console.error('Erro: JWT_SECRET está usando um valor placeholder/padrão conhecido. Gere um novo.');
  process.exit(1);
}
if (env.ADMIN_PASSWORD.length < 12) {
  console.error('Erro: ADMIN_PASSWORD deve ter no mínimo 12 caracteres.');
  process.exit(1);
}

module.exports = env;