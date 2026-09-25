// Polish G6: the production Docker stack builds from this branch and comes up healthy — Postgres,
// Redis, storage, the one-shot migrate + seed, two api replicas, the worker, the web app and nginx —
// so `docker compose up` still does what the README promises. Sign-ups are raised for the browser
// suite that runs against it next (as scripts/verify-auth-web.mjs does), and every page the suite
// opens first is warmed through nginx.
import { fail, run } from './lib.mjs';

const build = run('docker', ['compose', 'build'], { env: { ...process.env, COMPOSE_PARALLEL_LIMIT: '1' } });
if (build.status !== 0) fail(`compose build failed:\n${build.out.slice(-4000)}`);
const up = run('docker', ['compose', 'up', '-d', '--wait', '--wait-timeout', '300'], { env: { ...process.env, REGISTER_LIMIT_PER_HOUR: '500' } });
if (up.status !== 0) fail(`compose up failed:\n${up.out.slice(-4000)}`);

const ps = run('docker', ['compose', 'ps', '--format', '{{.Service}} {{.State}} {{.Health}}']);
const rows = ps.out.trim().split('\n');
for (const service of ['postgres', 'redis', 'storage', 'api-1', 'api-2', 'worker', 'web', 'nginx']) {
  const row = rows.find((r) => r.startsWith(`${service} `));
  if (!row || !/running/.test(row) || /unhealthy|starting/.test(row)) fail(`${service} is not up and healthy: ${row ?? 'missing'}`);
}

for (const path of ['/', '/login', '/signup', '/app', '/status', '/api/health']) {
  let ok = false;
  for (let i = 0; i < 30 && !ok; i += 1) {
    const res = await fetch(`http://localhost:8080${path}`, { redirect: 'manual' }).catch(() => null);
    ok = !!res && res.status < 500;
    if (!ok) await new Promise((r) => setTimeout(r, 1000));
  }
  if (!ok) fail(`nginx never answered ${path}`);
}
// The landing that nginx serves is this branch's: it carries the crowd.
const home = await (await fetch('http://localhost:8080/')).text();
if (!home.includes('data-crowd-band')) fail('the stack is serving a landing page without the crowd: an old image?');
console.log('stack: 8 services up and healthy; pages warm through nginx on :8080');
console.log('STACK_UP_OK');
