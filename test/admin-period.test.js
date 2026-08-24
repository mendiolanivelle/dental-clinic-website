import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveAdminPeriod } from '../server/admin-period.js'

test('admin periods use equal previous windows and safe year-over-year dates', () => {
  const now = new Date('2026-08-24T04:00:00.000Z')
  assert.deepEqual(resolveAdminPeriod({ from: '2026-08-18', to: '2026-08-24' }, now).comparison, {
    from: '2026-08-11',
    to: '2026-08-17',
  })
  assert.deepEqual(resolveAdminPeriod({ from: '2024-02-29', to: '2024-02-29', compare: 'year_over_year' }, now).comparison, {
    from: '2023-02-28',
    to: '2023-02-28',
  })
  assert.throws(() => resolveAdminPeriod({ from: '2026-08-25', to: '2026-08-24' }, now), /INVALID_DATE_RANGE/)
})
