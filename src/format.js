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
