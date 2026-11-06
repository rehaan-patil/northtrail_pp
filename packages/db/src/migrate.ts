import { connectDatabase, migrate } from './index.js';

const driver = process.env.DATABASE_DRIVER ?? 'pglite';
if (driver !== 'pglite' && driver !== 'postgres') {
  throw new Error('Invalid DATABASE_DRIVER');
}

const db = await connectDatabase({
  driver,
  path: process.env.DATABASE_PATH ?? '../../.data/northtrail',
  ...(process.env.DATABASE_URL ? { url: process.env.DATABASE_URL } : {}),
});

try {
  const applied = await migrate(db);
  console.log(JSON.stringify({ applied }));
} finally {
  await db.close();
}