// G4: web and api both depend on and import @nook/contracts, and its schemas behave.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fail, root } from './lib.mjs';

function sources(dir) {
  return readdirSync(dir).flatMap((name) => {
    if (name === 'node_modules' || name === 'generated' || name.startsWith('.')) return [];
    const p = join(dir, name);
    return statSync(p).isDirectory() ? sources(p) : /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}

for (const app of ['web', 'api']) {
  const pkg = JSON.parse(readFileSync(join(root, 'apps', app, 'package.json'), 'utf8'));
  if (pkg.dependencies?.['@nook/contracts'] !== 'workspace:*') fail(`apps/${app} does not depend on @nook/contracts`);
  const importers = sources(join(root, 'apps', app, 'src')).filter((f) => /from ['"]@nook\/contracts['"]/.test(readFileSync(f, 'utf8')));
  if (!importers.length) fail(`apps/${app}/src never imports @nook/contracts`);
  console.log(`${app}: ${importers.length} file(s) import contracts`);
}

const c = await import(pathToFileURL(join(root, 'packages/contracts/dist/index.js')).href);
const id = '01900000-0000-7000-8000-000000000001';
const good = c.SendMessage.safeParse({ clientId: id, channelId: id, body: '  hello  ' });
if (!good.success || good.data.body !== 'hello' || good.data.threadRootId !== null) fail('SendMessage did not parse a valid message');
if (c.SendMessage.safeParse({ clientId: id, channelId: id, body: '   ' }).success) fail('SendMessage accepted an empty message (negative control)');
if (c.Kit.safeParse({ field: '#0e5b3f', mark: 'yellow' }).success) fail('Kit accepted a non-hex colour (negative control)');
if (!c.Kit.safeParse({ field: '#0e5b3f', mark: '#f2c12e' }).success) fail('Kit rejected valid colours');
console.log('CONTRACTS_OK');
