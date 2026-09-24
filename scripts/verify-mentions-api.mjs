// Phase 8 G2: mentions, notifications and unread, with every earlier suite as regression.
import { runApiTests } from './api-tests.mjs';

runApiTests([
  // earlier phases
  'rotates', 'exactly maxUses', 'across api instances through the Redis adapter', 'replica died', 'counts replies',
  'thumbnails images in the worker', 'resolve to private addresses, at connect time',
  // mention parsing
  'finds handles at the start', 'ignores email addresses', 'ignores mentions inside code',
  // notifications
  'notifies mentioned channel members live across instances',
  'does not notify someone who is not in the channel',
  'reply notifies the thread root author and earlier repliers',
  'opening a thread marks its notifications read',
  // unread
  'unread counts and mention counts follow the read pointer',
  'read pointer never moves backwards',
  'reading a channel past a mention clears its notification',
  // edits, deletes, inbox
  'an edit that adds a mention notifies once',
  'a deleted message drops out of the inbox',
  'pages newest first and marks some or all read',
]);
console.log('MENTIONS_API_OK');
