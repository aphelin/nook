// G5: fresh `docker compose up` brings the whole stack to healthy and it behaves end to end.
import { join } from 'node:path';
import { fail, root, run } from './lib.mjs';

const BASE = 'http://localhost:8080';
const step = (m) => console.log(`• ${m}`);

step('resetting stack and volumes');
run('docker', ['compose', 'down', '-v', '--remove-orphans']);

step('building images one at a time (registry-friendly)');
const build = run('docker', ['compose', 'build'], { env: { ...process.env, COMPOSE_PARALLEL_LIMIT: '1' } });
if (build.status !== 0) fail(`compose build failed:\n${build.out.slice(-3000)}`);

step('starting (waits for healthchecks)');
const up = run('docker', ['compose', 'up', '-d', '--wait', '--wait-timeout', '300']);
if (up.status !== 0) fail(`compose up failed:\n${up.out.slice(-3000)}`);

const migrate = run('docker', ['compose', 'ps', '-a', '--format', '{{.Service}} {{.ExitCode}}', 'migrate']);
if (!/^migrate 0$/m.test(migrate.out)) fail(`migrate did not exit 0: ${migrate.out}`);

step('schema in fresh database matches schema.prisma');
const diff = run('pnpm', ['exec', 'prisma', 'migrate', 'diff', '--from-config-datasource', '--to-schema', 'prisma/schema.prisma', '--exit-code'], {
  cwd: join(root, 'apps/api'),
  env: { ...process.env, DATABASE_URL: 'postgresql://nook:nook@localhost:5432/nook' },
});
if (diff.status !== 0) fail(`database drifted from schema:\n${diff.out}`);

step('nginx round-robins /api/health across replicas');
const instances = new Set();
for (let i = 0; i < 8; i++) {
  const res = await fetch(`${BASE}/api/health`);
  const body = await res.json();
  if (res.status !== 200 || body.status !== 'ok' || body.checks.database !== 'up' || body.checks.redis !== 'up') {
    fail(`unhealthy api response: ${res.status} ${JSON.stringify(body)}`);
  }
  instances.add(body.instance);
}
if (instances.size !== 2) fail(`expected 2 api replicas, saw ${[...instances].join(', ')}`);
console.log(`  replicas: ${[...instances].sort().join(', ')}`);

step('app containers can be recreated (addresses reshuffled) without restarting nginx');
// Stop them first so their addresses are released, then start in a different order: this is
// what a redeploy does, and it hands the old api addresses to other containers.
run('docker', ['compose', 'rm', '-sf', 'api-1', 'api-2', 'worker', 'web']);
const recreate = run('docker', ['compose', 'up', '-d', '--no-deps', '--wait', 'web', 'worker', 'api-2', 'api-1']);
if (recreate.status !== 0) fail(`could not recreate api replicas:\n${recreate.out.slice(-2000)}`);
const after = new Set();
for (let i = 0; i < 20; i++) {
  const res = await fetch(`${BASE}/api/health`);
  if (res.status !== 200) fail(`nginx returned ${res.status} after the replicas were recreated (stale upstream addresses?)`);
  after.add((await res.json()).instance);
  await new Promise((r) => setTimeout(r, 100));
}
if (after.size !== 2) fail(`after recreation, expected 2 replicas, saw ${[...after].join(', ')}`);
console.log(`  still round-robined: ${[...after].sort().join(', ')}`);

step('web serves through nginx and reaches the api server-side');
const page = await fetch(`${BASE}/status`);
const html = await page.text();
if (page.status !== 200) fail(`web returned ${page.status}`);
if (!/data-testid="api-status"[^>]*>ok · api-[12]</.test(html)) fail('web page did not render a healthy api status');

step('worker heartbeat present in redis');
const beat = run('docker', ['compose', 'exec', '-T', 'redis', 'redis-cli', 'GET', 'worker:heartbeat']);
if (beat.out.trim() !== 'worker-1') fail(`worker heartbeat missing: "${beat.out.trim()}"`);

step('object storage healthy');
const s3 = await fetch('http://localhost:8333/healthz').catch((e) => fail(`storage unreachable: ${e}`));
if (s3.status !== 200) fail(`storage healthz returned ${s3.status}`);

console.log('STACK_OK');
