import { readEnvironment } from '@northtrail/config';
import { connectDatabase } from '@northtrail/db';
import { buildApp } from './app.js';

const env = readEnvironment(process.env);
const db = await connectDatabase({
  driver: env.DATABASE_DRIVER,
  path: env.DATABASE_PATH,
  ...(env.DATABASE_URL ? { url: env.DATABASE_URL } : {}),
});

const app = await buildApp(env, db);

let isClosing = false;
async function handleShutdown() {
  if (isClosing) return;
  isClosing = true;
  await app.close();
  await db.close();
}

process.once('SIGINT', () => {
  void handleShutdown();
});

process.once('SIGTERM', () => {
  void handleShutdown();
});

await app.listen({ port: env.PORT, host: env.HOST });