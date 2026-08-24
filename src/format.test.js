import assert from 'node:assert/strict'
import test from 'node:test'
import { calendarWeek, formatCurrency, formatDate, formatInterval, isInManilaPaymentPeriod, titleCase } from './format.js'

test('patient-facing values use stable Manila-friendly formatting', () => {
  assert.equal(formatDate('2026-07-21'), 'July 21, 2026')
  assert.equal(formatInterval(180), 'Every 6 months')
  assert.equal(formatCurrency(250000), '₱2,500.00')
  assert.equal(titleCase('brace_adjustment'), 'Brace Adjustment')
  assert.deepEqual(calendarWeek('2026-08-24'), [
    '2026-08-23',
    '2026-08-24',
    '2026-08-25',
    '2026-08-26',
    '2026-08-27',
    '2026-08-28',
    '2026-08-29',
  ])
  const mondayInManila = new Date('2026-08-24T01:00:00+08:00')
  assert.equal(isInManilaPaymentPeriod('2026-08-24T00:30:00+08:00', 'today', mondayInManila), true)
  assert.equal(isInManilaPaymentPeriod('2026-08-23T23:30:00+08:00', 'today', mondayInManila), false)
  assert.equal(isInManilaPaymentPeriod('2026-08-23T23:30:00+08:00', 'week', mondayInManila), true)
  assert.equal(isInManilaPaymentPeriod('2026-08-22T23:30:00+08:00', 'week', mondayInManila), false)
})
