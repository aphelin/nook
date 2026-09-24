// Phase 12 G2: the landing page's demo sign-in, with every earlier suite as regression.
import { runApiTests } from './api-tests.mjs';

runApiTests([
  // earlier phases
  'rotates', 'exactly maxUses', 'across api instances through the Redis adapter', 'replica died', 'counts replies',
  'thumbnails images in the worker', 'resolve to private addresses, at connect time',
  'notifies mentioned channel members live across instances', 'unread counts and mention counts follow the read pointer',
  'finds words and prefixes case-insensitively', 'only searches channels you are in',
  'crops an upload to a 256px square WebP', 'tells people who share a nook live',
  // demo sign-in
  'does not exist unless enabled',
  'answers 404 when the demo account was never seeded',
  'signs in as the demo member only',
  'is rate limited per address',
]);
console.log('LANDING_API_OK');
