// Phase 11 G4: axe over every main screen and popup, light and dark, against the docker stack.
import { fail, run } from './lib.mjs';

const up = run('docker', ['compose', 'up', '-d', '--wait', '--wait-timeout', '300'], { env: { ...process.env, REGISTER_LIMIT_PER_HOUR: '500' } });
if (up.status !== 0) fail(`compose up failed:\n${up.out.slice(-3000)}`);
run('docker', ['compose', 'exec', '-T', 'redis', 'sh', '-c', "redis-cli --scan --pattern 'rl:*' | xargs -r redis-cli DEL"]);

const e2e = run('pnpm', ['exec', 'playwright', 'test', 'e2e/a11y.spec.ts'], { env: { ...process.env, E2E_BASE_URL: process.env.E2E_BASE_URL ?? 'http://localhost:8080' } });
const passed = e2e.out.match(/(\d+) passed/);
if (e2e.status !== 0 || !passed || Number(passed[1]) < 2 || /\d+ failed/.test(e2e.out)) fail(`accessibility checks failed:\n${e2e.out.slice(-6000)}`);
console.log(`accessibility: ${passed[1]} passes (light and dark)`);
console.log('A11Y_OK');
