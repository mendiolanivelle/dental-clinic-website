import assert from 'node:assert/strict'
import test from 'node:test'
import { formatDate, formatInterval, titleCase } from './format.js'

test('patient-facing values use stable Manila-friendly formatting', () => {
  assert.equal(formatDate('2026-07-21'), 'July 21, 2026')
  assert.equal(formatInterval(180), 'Every 6 months')
  assert.equal(titleCase('brace_adjustment'), 'Brace Adjustment')
})
