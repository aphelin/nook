// Phase 6 G2: threads and reactions, with every earlier suite as regression.
import { runApiTests } from './api-tests.mjs';

runApiTests([
  // earlier phases
  'rotates', 'exactly maxUses', 'across api instances through the Redis adapter', 'replica died', 'relays typing',
  // threads
  'counts replies, tracks repliers and updates the root live',
  'pages a thread oldest-to-newest',
  'replies to replies, to other channels, and to deleted messages',
  'decrements the count when a reply is deleted',
  // reactions
  'adds and removes idempotently',
  'refuses non-emoji, non-members, and system lines',
]);
console.log('THREADS_API_OK');
