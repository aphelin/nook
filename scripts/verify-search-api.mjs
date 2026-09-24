// Phase 9 G2: message search, with every earlier suite as regression.
import { runApiTests } from './api-tests.mjs';

runApiTests([
  // earlier phases
  'rotates', 'exactly maxUses', 'across api instances through the Redis adapter', 'replica died', 'counts replies',
  'thumbnails images in the worker', 'resolve to private addresses, at connect time',
  'notifies mentioned channel members live across instances', 'unread counts and mention counts follow the read pointer',
  // parsing
  'splits words and filters', 'turns -word into an exclusion', 'drops full-text query syntax',
  // search
  'finds words and prefixes case-insensitively, newest first, in pages',
  'only searches channels you are in',
  'filters by in:#channel and from:@handle',
  'excludes -words',
  'leaves deleted messages out and re-indexes edits',
  'finds thread replies',
  'answers syntax-heavy and empty queries without an error',
]);
console.log('SEARCH_API_OK');
