const MANILA_TIME_ZONE = 'Asia/Manila'

function asDate(value) {
  if (!value) return null
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00+08:00`)
    : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatDate(value, options = {}) {
  const date = asDate(value)
  if (!date) return 'Not available'

  return new Intl.DateTimeFormat('en-PH', {
    timeZone: MANILA_TIME_ZONE,
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    ...options,
  }).format(date)
}

export function formatTime(value) {
  const date = asDate(value)
  if (!date) return 'Time to be confirmed'

  return new Intl.DateTimeFormat('en-PH', {
    timeZone: MANILA_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

export function formatDateTime(value) {
  const date = asDate(value)
  if (!date) return 'Schedule to be confirmed'

  return `${formatDate(value, { weekday: 'long' })} at ${formatTime(value)}`
}

export function formatCurrency(cents = 0) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(cents / 100)
}

export function isInManilaPaymentPeriod(value, period, now = new Date()) {
  const key = (input) => {
    const date = asDate(input)
    if (!date) return ''
    const parts = new Intl.DateTimeFormat('en', {
      timeZone: MANILA_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date)
    const part = (type) => parts.find((item) => item.type === type)?.value
    return `${part('year')}-${part('month')}-${part('day')}`
  }
  const paymentDay = key(value)
  const today = key(now)
  if (!paymentDay || !today) return false
  if (period === 'today') return paymentDay === today
  const weekStart = new Date(`${today}T00:00:00Z`)
  weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay())
  return paymentDay >= weekStart.toISOString().slice(0, 10) && paymentDay <= today
}

export function calendarWeek(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return []
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return []
  date.setUTCDate(date.getUTCDate() - date.getUTCDay())
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(date)
    day.setUTCDate(day.getUTCDate() + index)
    return day.toISOString().slice(0, 10)
  })
}

export function formatInterval(days) {
  if (!days || days < 1) return 'As advised by your dentist'
  if (days % 365 === 0) return `Every ${days / 365} year${days === 365 ? '' : 's'}`
  if (days % 30 === 0) return `Every ${days / 30} month${days === 30 ? '' : 's'}`
  if (days % 7 === 0) return `Every ${days / 7} week${days === 7 ? '' : 's'}`
  return `Every ${days} days`
}

export function titleCase(value = '') {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}
