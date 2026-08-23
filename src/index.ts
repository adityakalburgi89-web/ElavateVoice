import { buildApp } from './app.js';
import { env } from './config/env.js';
import { databaseService } from './services/databaseService.js';

const app = buildApp();

async function start() {
  try {
    await databaseService.initSchema();
    await app.listen({ port: env.PORT, host: env.HOST });
    app.log.info(`ElevateVoice Backend listening on http://${env.HOST}:${env.PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
