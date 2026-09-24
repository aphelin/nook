// Phase 13 G3: the README's one command works from a fresh clone, and the README's media regenerate.
// Clones HEAD, runs `docker compose up -d --build` in it as its own project (see fresh-stack.mjs),
// checks the stack end to end, regenerates every README image into a scratch directory and compares
// the set with what the README references, then removes the copy and restarts the main stack.
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BASE, PROJECT, down, up } from './fresh-stack.mjs';
import { fail, root, run } from './lib.mjs';

const readme = readFileSync(join(root, 'README.md'), 'utf8');
if (!readme.includes('```bash\ndocker compose up -d --build\n')) fail('the README no longer documents `docker compose up -d --build`');
const referenced = new Set([...readme.matchAll(/docs\/media\/([\w.-]+)/g)].map((m) => m[1]));

const out = mkdtempSync(join(tmpdir(), 'nook-fresh-media-'));
let problem = null;
const clone = await up();
try {
  const migrate = run('docker', ['compose', '-p', PROJECT, 'ps', '-a', '--format', '{{.Service}} {{.ExitCode}} {{.State}}'], { cwd: clone });
  if (!/^migrate 0 exited$/m.test(migrate.out)) throw new Error(`migrate did not exit 0:\n${migrate.out}`);
  const running = migrate.out.split('\n').filter((l) => / running$/.test(l)).length;
  if (running !== 8) throw new Error(`expected 8 running services besides migrate, saw ${running}:\n${migrate.out}`);
  console.log('• nine containers: migrate exited 0, eight running');

  const instances = new Set();
  for (let i = 0; i < 10; i++) {
    const body = await (await fetch(`${BASE}/api/health`)).json();
    if (body.status !== 'ok') throw new Error(`unhealthy: ${JSON.stringify(body)}`);
    instances.add(body.instance);
  }
  if (instances.size !== 2) throw new Error(`expected both api replicas to answer, saw ${[...instances]}`);
  console.log(`• replicas answering: ${[...instances].sort().join(', ')}`);

  const demo = await fetch(`${BASE}/api/auth/demo`, { method: 'POST' });
  if (demo.status !== 200 && demo.status !== 201) throw new Error(`demo sign-in answered ${demo.status}`);
  const { accessToken } = await demo.json();
  const nooks = await (await fetch(`${BASE}/api/nooks`, { headers: { Authorization: `Bearer ${accessToken}` } })).json();
  const slugs = (Array.isArray(nooks) ? nooks : nooks.nooks).map((n) => n.slug).sort();
  if (slugs.join() !== 'dog-eared,patch-bay,tuesday-climbers') throw new Error(`demo member's nooks: ${slugs}`);
  console.log('• demo sign-in works; the three seeded nooks are there');

  const media = run('node', [join(root, 'scripts/readme-media.mjs'), '--out', out], { timeout: 900_000 });
  if (media.status !== 0 || !media.out.includes('MEDIA_OK')) throw new Error(`media script failed:\n${media.out.slice(-3000)}`);
  const produced = new Set(readdirSync(out));
  const missing = [...referenced].filter((f) => !produced.has(f));
  const extra = [...produced].filter((f) => !referenced.has(f));
  if (missing.length || extra.length) throw new Error(`regenerated media differ from the README's: missing ${missing}, extra ${extra}`);
  console.log(`• regenerated all ${produced.size} README media files`);
} catch (e) {
  problem = e;
} finally {
  await down();
  rmSync(out, { recursive: true, force: true });
}
if (problem) fail(problem.message);

// Just restarted: nginx can drop the first connections while it comes up, so retry for a minute.
const main = new Set();
for (let i = 0; i < 60 && main.size < 2; i++) {
  const body = await fetch(`${BASE}/api/health`)
    .then((r) => r.json())
    .catch(() => null);
  if (body?.status === 'ok') main.add(body.instance);
  else await new Promise((r) => setTimeout(r, 1000));
}
if (main.size !== 2) fail(`the main stack did not come back with both replicas: ${[...main]}`);
console.log('• main stack back');
console.log('FRESH_CLONE_OK');
