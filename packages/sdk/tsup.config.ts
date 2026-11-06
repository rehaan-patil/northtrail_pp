import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: { resolve: ['@northtrail/domain'] },
  clean: true,
  noExternal: ['@northtrail/domain'],
});