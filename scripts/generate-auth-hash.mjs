#!/usr/bin/env node
// Regenerates the salted credential hash used by src/services/authService.ts.
//
// Usage:
//   node scripts/generate-auth-hash.mjs <email> <newPassword>
//
// Copy the printed SALT and HASH into authService.ts (CREDENTIAL_SALT, CREDENTIAL_HASH),
// and AUTHORIZED_EMAIL if the email changed. The password itself is never written to disk.

import { randomBytes, createHash } from 'node:crypto';

const [, , email, password] = process.argv;

if (!email || !password) {
  console.error('Usage: node scripts/generate-auth-hash.mjs <email> <newPassword>');
  process.exit(1);
}

const salt = randomBytes(16).toString('hex');
const hash = createHash('sha256').update(`${salt}:${email.trim().toLowerCase()}:${password}`).digest('hex');

console.log(`AUTHORIZED_EMAIL = '${email.trim().toLowerCase()}'`);
console.log(`CREDENTIAL_SALT  = '${salt}'`);
console.log(`CREDENTIAL_HASH  = '${hash}'`);
