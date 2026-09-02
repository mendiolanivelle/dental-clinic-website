import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUuid } from '../src/uuid.js'

test('UUID generation falls back on older iOS Safari', () => {
  const uuid = randomUuid({
    getRandomValues: (bytes) => {
      bytes.forEach((_, index) => { bytes[index] = index })
      return bytes
    },
  })
  assert.equal(uuid, '00010203-0405-4607-8809-0a0b0c0d0e0f')
})
