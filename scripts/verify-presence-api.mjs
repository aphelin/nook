// Phase 5 G2: presence and typing, with every earlier suite as regression.
import { runApiTests } from './api-tests.mjs';

runApiTests([
  // earlier phases
  'rotates', 'lost', 'exactly maxUses', 'across api instances through the Redis adapter', 'retry with the same clientId',
  // presence
  'coming online and going offline across instances',
  'any tab is open, and only announces real changes',
  'every tab is idle',
  'do-not-disturb',
  'replica died',
  'snapshot to members only',
  // typing
  'relays typing to other members across instances',
]);
console.log('PRESENCE_API_OK');
