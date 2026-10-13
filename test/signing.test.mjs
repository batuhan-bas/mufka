import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickIdentity, chooseIdentity } from '../scripts/sign-mac.mjs';

const out = `
  1) AAAABBBBCCCCDDDDEEEEFFFF0000111122223333 "Apple Development: a@b.c (TEAMID0001)"
  2) 1111111111111111111111111111111111111111 "Developer ID Application: A B (TEAM123456)"
     2 valid identities found`;

test('pickIdentity prefers Developer ID, then Apple Development', () => {
  assert.equal(pickIdentity(out), 'Developer ID Application: A B (TEAM123456)');
  assert.equal(pickIdentity(out.split('\n').slice(0, 2).join('\n')), 'Apple Development: a@b.c (TEAMID0001)');
  assert.equal(pickIdentity('     0 valid identities found'), null);
  assert.equal(pickIdentity('  1) 2222222222222222222222222222222222222222 "Some Self Signed"'), null);
});

test('MUFKA_SIGN_IDENTITY wins', () => {
  assert.equal(chooseIdentity({ MUFKA_SIGN_IDENTITY: 'Mine' }), 'Mine');
});
