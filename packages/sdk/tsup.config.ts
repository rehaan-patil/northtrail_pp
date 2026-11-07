import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: { resolve: ['@northtrail/domain', '@northtrail/aqua', '@northtrail/compass'] },
  clean: true,
  noExternal: ['@northtrail/domain', '@northtrail/aqua', '@northtrail/compass'],
});