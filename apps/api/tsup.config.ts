import { cp } from 'node:fs/promises';
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'runtime/server': 'src/server.ts',
    'runtime/migrate': '../../packages/db/src/migrate.ts',
  },
  format: ['esm'],
  target: 'node24',
  clean: true,
  splitting: false,
  external: ['pg', '@electric-sql/pglite'],
  noExternal: [/^@northtrail\//],
  async onSuccess() {
    await cp('../../packages/db/migrations', 'dist/migrations', { recursive: true });
  },
});