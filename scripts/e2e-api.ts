import { connectDatabase, migrate } from '../packages/db/src/index.js';
import { readEnvironment } from '../packages/config/src/index.js';
import { buildApp } from '../apps/api/src/app.js';

const db = await connectDatabase({ driver: 'pglite' });
await migrate(db);
const app = await buildApp(
  readEnvironment({ NODE_ENV: 'test', APP_ORIGIN: 'http://127.0.0.1:3000' }),
  db,
);
await app.listen({ host: '127.0.0.1', port: 4000 });
async function close() {
  await app.close();
  await db.close();
}
process.once('SIGINT', () => {
  void close();
});
process.once('SIGTERM', () => {
  void close();
});
