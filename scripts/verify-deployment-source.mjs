import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Inspect Vercel's uploaded source tree, not its generated output tree.
export function verifyDeploymentSource(tree) {
  const source = Array.isArray(tree) && tree.find((node) => node.name === 'src');
  if (!source || !Array.isArray(source.children)) throw new Error('Missing source manifest.');
  const paths = [];
  function walk(nodes, prefix = '') {
    for (const node of nodes) {
      if (!node || typeof node.name !== 'string' || /[\\/]/.test(node.name))
        throw new Error('Malformed manifest entry.');
      const path = `${prefix}${node.name}`;
      if (node.type === 'directory') walk(node.children ?? [], `${path}/`);
      else paths.push(path);
    }
  }
  walk(source.children);
  const allowedRoot =
    /^(apps\/|packages\/|integrations\/|package\.json$|pnpm-lock\.yaml$|pnpm-workspace\.yaml$|tsconfig(?:\.base)?\.json$|\.npmrc$|\.nvmrc$|\.vercelignore$)/;
  const prohibited =
    /(^|\/)(\.env[^/]*|\.git|\.vercel|node_modules|dist|\.next|tmp|\.data|test-results|coverage|playwright-report)(\/|$)|\.(tsbuildinfo|log|pdf|pem|key)$/i;
  const rejected = paths.filter((path) => !allowedRoot.test(path) || prohibited.test(path));
  if (rejected.length)
    throw new Error(
      `Unexpected uploaded source: ${rejected.slice(0, 10).join(', ')} (${rejected.length} total)`,
    );
  for (const required of [
    'package.json',
    'pnpm-lock.yaml',
    'apps/web/app/page.tsx',
    'packages/sdk/src/index.ts',
  ])
    if (!paths.includes(required)) throw new Error(`Missing required source: ${required}`);
  return { sourceFiles: paths.length, unexpectedFiles: 0 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv[2])
    throw new Error('Usage: node scripts/verify-deployment-source.mjs <manifest.json>');
  const tree = JSON.parse(readFileSync(process.argv[2], 'utf8').replace(/^\uFEFF/, ''));
  console.log(verifyDeploymentSource(tree));
}
