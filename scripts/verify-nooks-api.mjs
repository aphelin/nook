// Phase 3 G2: nooks, channels, DMs and invites, with the auth suite as regression.
import { runApiTests } from './api-tests.mjs';

runApiTests([
  // auth regression
  'rotates', 'reused', '11th login',
  // nooks
  'creates a nook', 'taken slug', 'only the nooks you belong to', 'non-members with a 404', 'only the founder',
  // channels
  'private channels only the invited can see',
  // DMs
  'one channel per pair', 'yourself or with people outside',
  // invites
  'previews publicly', 'idempotent for existing members', 'double-clicked join', 'exactly maxUses', 'expired and revoked',
]);
console.log('NOOKS_API_OK');
