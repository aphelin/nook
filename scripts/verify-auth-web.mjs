// G3: rebuilds the docker stack and runs the browser auth flow against it through nginx.
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fail, run } from './lib.mjs';

const build = run('docker', ['compose', 'build'], { env: { ...process.env, COMPOSE_PARALLEL_LIMIT: '1' } });
if (build.status !== 0) fail(`compose build failed:\n${build.out.slice(-3000)}`);
// The suite signs up more people than one IP may in an hour; this run's stack allows it.
const up = run('docker', ['compose', 'up', '-d', '--wait', '--wait-timeout', '300'], { env: { ...process.env, REGISTER_LIMIT_PER_HOUR: '500' } });
if (up.status !== 0) fail(`compose up failed:\n${up.out.slice(-3000)}`);

// Repeated runs from one IP would otherwise trip the real signup/login rate limits.
const cleared = run('docker', ['compose', 'exec', '-T', 'redis', 'sh', '-c', "redis-cli --scan --pattern 'rl:*' | xargs -r redis-cli DEL"]);
if (cleared.status !== 0) fail(`could not reset rate-limit keys:\n${cleared.out}`);

// A freshly recreated stack answers its first requests slowly; warm the pages the suite opens first.
for (const path of ['/login', '/signup', '/app', '/api/health']) {
  for (let i = 0; i < 30; i++) {
    const res = await fetch(`http://localhost:8080${path}`, { redirect: 'manual' }).catch(() => null);
    if (res && res.status < 500) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
}

const e2e = run('pnpm', ['exec', 'playwright', 'test'], { env: { ...process.env, E2E_BASE_URL: 'http://localhost:8080' } });
// Keep the whole report outside test-results/ (the next Playwright run clears it): an intermittent
// failure has to be readable after the fact.
const report = join(tmpdir(), 'nook-browser-suite.log');
writeFileSync(report, e2e.out);
console.log(`full report: ${report}`);
const passed = e2e.out.match(/(\d+) passed/);
if (e2e.status !== 0 || !passed || /\d+ failed/.test(e2e.out)) fail(`browser tests failed:\n${e2e.out.slice(-4000)}`);
console.log(`browser tests: ${passed[1]} passed`);
console.log('AUTH_WEB_OK');
