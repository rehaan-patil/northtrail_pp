import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyDeploymentSource } from './verify-deployment-source.mjs';

function manifest(extra = []) {
  return [
    {
      name: 'src',
      children: [
        { name: 'package.json', type: 'file' },
        { name: 'pnpm-lock.yaml', type: 'file' },
        {
          name: 'apps',
          type: 'directory',
          children: [
            {
              name: 'web',
              type: 'directory',
              children: [
                { name: 'app', type: 'directory', children: [{ name: 'page.tsx', type: 'file' }] },
              ],
            },
          ],
        },
        {
          name: 'packages',
          type: 'directory',
          children: [
            {
              name: 'sdk',
              type: 'directory',
              children: [
                { name: 'src', type: 'directory', children: [{ name: 'index.ts', type: 'file' }] },
              ],
            },
          ],
        },
        ...extra,
      ],
    },
  ];
}
test('accepts source and ignores generated deployment output', () => {
  assert.equal(verifyDeploymentSource([...manifest(), { name: 'out' }]).sourceFiles, 4);
});
test('rejects missing or malformed source manifests', () => {
  for (const input of [
    [],
    {},
    [{ name: 'src', children: [] }],
    manifest([{ name: '../secret', type: 'file' }]),
  ])
    assert.throws(() => verifyDeploymentSource(input));
});
test('rejects temporary, credential, build and unexpected root files', () => {
  for (const name of ['tmp', '.env.local', 'coverage', 'private.json', 'docs'])
    assert.throws(() => verifyDeploymentSource(manifest([{ name, type: 'file' }])));
  for (const name of ['.env.example', '.env.local', 'private.key', 'cache.tsbuildinfo', 'dist'])
    assert.throws(() =>
      verifyDeploymentSource(
        manifest([{ name: 'apps', type: 'directory', children: [{ name, type: 'file' }] }]),
      ),
    );
});
