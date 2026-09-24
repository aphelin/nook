// Phase 7 G2: uploads, thumbnails, unfurls and the SSRF guard, with every earlier suite as regression.
import { runApiTests } from './api-tests.mjs';

runApiTests([
  // earlier phases
  'rotates', 'exactly maxUses', 'across api instances through the Redis adapter', 'replica died', 'counts replies',
  // uploads
  'unsupported types and oversize files',
  'complete before the bytes arrive',
  'sends a file on its own and serves it through a signed URL',
  'thumbnails images in the worker',
  'someone else’s upload',
  'cleans up uploads that were never sent',
  // unfurls + SSRF
  'unfurls a link in the worker',
  '169.254.169.254',
  'resolve to private addresses, at connect time',
]);
console.log('UPLOADS_API_OK');
