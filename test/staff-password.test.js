import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hashStaffPassword, verifyStaffPassword } from '../server/staff-auth.js'

test('staff passwords are salted, hashed, and compared without storing plaintext', async () => {
  const password = 'temporary-123'
  const stored = await hashStaffPassword(password, () => Buffer.alloc(16, 7))
  assert.notEqual(stored.passwordHash, password)
  assert.equal(await verifyStaffPassword(password, stored.passwordSalt, stored.passwordHash), true)
  assert.equal(await verifyStaffPassword('wrong-password', stored.passwordSalt, stored.passwordHash), false)
})
