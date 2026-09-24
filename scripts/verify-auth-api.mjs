// Phase 2 G2: auth suite.
import { runApiTests } from './api-tests.mjs';

runApiTests(['register', 'duplicate', 'invalid', 'wrong password', 'me', 'rotates', 'reused', 'logout', '11th login']);
console.log('AUTH_API_OK');
