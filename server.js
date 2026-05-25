const app = require('./src/app');
const env = require('./src/config/env');
const { initializeDatabase } = require('./src/db/migrations');

const start = async () => {
  await initializeDatabase();
  app.listen(env.PORT, () => {
    console.log(`Backend rodando em http://localhost:${env.PORT}`);
  });
};
start();