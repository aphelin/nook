// Polish G2: chosen faces in the api, with every earlier suite as regression.
import { runApiTests } from './api-tests.mjs';

runApiTests([
  // earlier phases
  'rotates', 'exactly maxUses', 'across api instances through the Redis adapter', 'replica died', 'counts replies',
  'thumbnails images in the worker', 'resolve to private addresses, at connect time',
  'notifies mentioned channel members live across instances', 'unread counts and mention counts follow the read pointer',
  'finds words and prefixes case-insensitively', 'only searches channels you are in',
  'updates and normalises a profile, and validates it', 'lets a status clear itself at its expiry time',
  'tells people who share a nook live, and nobody else', 'refuses the wrong type or size',
  'crops an upload to a 256px square WebP behind a stable redirecting URL', 'replacing an avatar deletes the old one',
  'sweeps avatar uploads that were never completed',
  // faces
  'lets you choose a face, tells your nooks, and goes back to the generated one',
  'refuses a face that does not exist',
]);
console.log('FACES_API_OK');
