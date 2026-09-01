const datePattern = /^\d{4}-\d{2}-\d{2}$/

const parseDate = (value) => {
  if (!datePattern.test(value || '')) return null
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? date
    : null
}

const formatDate = (date) => date.toISOString().slice(0, 10)
const addDays = (date, days) => new Date(date.getTime() + days * 86_400_000)
const daysBetween = (from, to) => Math.round((to - from) / 86_400_000)

const shiftYear = (date, amount) => {
  const year = date.getUTCFullYear() + amount
  const month = date.getUTCMonth()
  const day = Math.min(date.getUTCDate(), new Date(Date.UTC(year, month + 1, 0)).getUTCDate())
  return new Date(Date.UTC(year, month, day))
}

const shiftMonth = (date, amount) => {
  const first = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + amount, 1))
  const day = Math.min(date.getUTCDate(), new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate())
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), day))
}

export function manilaToday(now) {
  return new Date(now.getTime() + 8 * 3_600_000).toISOString().slice(0, 10)
}

export function resolveAdminPeriod(query, now) {
  const today = parseDate(manilaToday(now))
  const defaultFrom = addDays(today, -29)
  const from = parseDate(query.from || formatDate(defaultFrom))
  const to = parseDate(query.to || formatDate(today))
  const compare = query.compare || 'previous_period'
  if (!from || !to || from > to) throw new Error('INVALID_DATE_RANGE')
  const dayCount = daysBetween(from, to) + 1
  if (dayCount > 731) throw new Error('DATE_RANGE_TOO_LARGE')

  let comparison = null
  if (compare === 'previous_period') {
    const comparisonTo = addDays(from, -1)
    comparison = { from: formatDate(addDays(comparisonTo, -(dayCount - 1))), to: formatDate(comparisonTo) }
  } else if (compare === 'previous_month') {
    comparison = { from: formatDate(shiftMonth(from, -1)), to: formatDate(shiftMonth(to, -1)) }
  } else if (compare === 'year_over_year') {
    comparison = { from: formatDate(shiftYear(from, -1)), to: formatDate(shiftYear(to, -1)) }
  } else if (compare !== 'none') {
    throw new Error('INVALID_COMPARISON')
  }

  return {
    from: formatDate(from),
    to: formatDate(to),
    compare,
    comparison,
    inProgress: to >= today,
    refreshedAt: now.toISOString(),
  }
}
