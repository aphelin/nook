// Phase 4 G2: realtime messaging, with the auth and nooks suites as regression.
import { runApiTests } from './api-tests.mjs';

runApiTests([
  // earlier phases
  'rotates', 'reused', 'lost', 'exactly maxUses', 'one channel per pair',
  // messaging
  'refuses sockets without a valid access token',
  'across api instances through the Redis adapter',
  'retry with the same clientId',
  'refuses non-members and empty messages',
  'rate-limits a flood',
  'pages backwards',
  'channel created after the socket connected',
  'only the author edit or delete',
  'join line',
]);
console.log('MESSAGES_API_OK');
