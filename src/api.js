export class ApiError extends Error {
  constructor(message, { status = 0, code = 'REQUEST_FAILED', offline = false } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.offline = offline
  }
}

async function request(path, { notifyUnauthorized = true, ...options } = {}) {
  let response

  try {
    response = await fetch(path, {
      ...options,
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    })
  } catch {
    throw new ApiError('Unable to reach the clinic portal.', {
      code: 'NETWORK_ERROR',
      offline: !navigator.onLine,
    })
  }

  const contentType = response.headers.get('content-type') || ''
  const payload = response.status === 204
    ? null
    : contentType.includes('application/json')
      ? await response.json().catch(() => null)
      : null

  if (!response.ok) {
    if (response.status === 401 && notifyUnauthorized) {
      window.dispatchEvent(new Event('portal:unauthorized'))
    }

    throw new ApiError(payload?.message || payload?.error?.message || 'The request could not be completed.', {
      status: response.status,
      code: payload?.code || payload?.error?.code || 'REQUEST_FAILED',
    })
  }

  return payload
}

const json = (body) => JSON.stringify(body)

export const api = {
  login: (details) => request('/api/auth/login', {
    method: 'POST',
    body: json(details),
    notifyUnauthorized: false,
  }),
  logout: () => request('/api/auth/logout', {
    method: 'POST',
    notifyUnauthorized: false,
  }),
  getMe: ({ notifyUnauthorized = true } = {}) => request('/api/me', { notifyUnauthorized }),
  getDashboard: () => request('/api/me/dashboard'),
  getServices: () => request('/api/me/services'),
  getAvailability: (date) => request(`/api/me/availability?date=${encodeURIComponent(date)}`),
  getAppointmentRequests: () => request('/api/me/appointment-requests'),
  createAppointmentRequest: (details) => request('/api/me/appointment-requests', {
    method: 'POST',
    body: json(details),
  }),
  getAppointments: (scope) => request(`/api/me/appointments?scope=${encodeURIComponent(scope)}`),
  getRecords: () => request('/api/me/records'),
  getTreatmentPlan: () => request('/api/me/treatment-plan'),
}
