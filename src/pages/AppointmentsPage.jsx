import { useCallback, useEffect, useState } from 'react'
import {
  CalendarCheck2,
  CalendarClock,
  CalendarX2,
  Clock3,
  History,
  Info,
  Phone,
  Stethoscope,
} from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api'
import ClinicPhoneLink from '../components/ClinicPhoneLink'
import { EmptyState, ErrorState, LoadingState } from '../components/PageState'
import { formatDate, formatTime, titleCase } from '../format'
import { appointmentRequestView, appointmentView, listFrom, serviceView } from '../portalData'

const statusColors = {
  scheduled: 'bg-[#e9e7f8] text-[#66569f]',
  confirmed: 'bg-mint text-brand',
  completed: 'bg-[#e6f0fa] text-[#376b95]',
  cancelled: 'bg-[#fff0e7] text-[#9a4e22]',
  no_show: 'bg-ink/8 text-ink/55',
}

const requestStatusColors = {
  requested: 'bg-mint text-brand',
  confirmed: 'bg-[#e6f0fa] text-[#376b95]',
  declined: 'bg-[#fff0e7] text-[#9a4e22]',
  cancelled: 'bg-ink/8 text-ink/55',
  completed: 'bg-[#e9e7f8] text-[#66569f]',
}

const timePreferenceLabels = {
  any: 'Any time',
  morning: 'Morning',
  afternoon: 'Afternoon',
}

function appointmentsFrom(payload, scope) {
  const appointments = listFrom(payload, 'appointments')
  return appointments.length ? appointments : listFrom(payload, scope)
}

function AppointmentCard({ value, upcoming }) {
  const appointment = appointmentView(value)

  return (
    <article className="rounded-3xl bg-white p-5 soft-shadow sm:p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <div className={`grid h-16 w-16 shrink-0 place-items-center rounded-2xl ${
          upcoming ? 'bg-brand text-white' : 'bg-cream text-brand'
        }`}>
          {upcoming ? <CalendarCheck2 size={26} /> : <History size={25} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-extrabold">{appointment.title}</h3>
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${
              statusColors[appointment.status] || 'bg-cream text-ink/55'
            }`}>
              {titleCase(appointment.status)}
            </span>
          </div>
          <div className="mt-3 flex flex-col gap-2 text-sm text-ink/55 sm:flex-row sm:flex-wrap sm:gap-x-6">
            <time className="flex items-center gap-2 font-semibold" dateTime={appointment.startsAt}>
              <CalendarClock className="text-brand" size={16} />
              {formatDate(appointment.startsAt, { weekday: 'long' })}
            </time>
            <span className="flex items-center gap-2">
              <Clock3 className="text-brand" size={16} />
              {formatTime(appointment.startsAt)}
              {appointment.endsAt ? ` – ${formatTime(appointment.endsAt)}` : ''}
            </span>
            <span className="flex items-center gap-2">
              <Stethoscope className="text-brand" size={16} />
              {appointment.dentistName}
            </span>
          </div>

          {appointment.instructions && (
            <div className="mt-4 flex gap-2.5 rounded-2xl bg-cream/75 p-3.5">
              <Info className="mt-0.5 shrink-0 text-brand" size={16} />
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-brand/65">Before your visit</p>
                <p className="mt-1 text-xs leading-5 text-ink/60">{appointment.instructions}</p>
              </div>
            </div>
          )}
        </div>

        {upcoming && appointment.status !== 'cancelled' && (
          <ClinicPhoneLink
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-brand/15 px-4 py-2.5 text-xs font-extrabold text-brand hover:bg-mint"
          >
            <Phone size={14} />
            Request reschedule
          </ClinicPhoneLink>
        )}
      </div>
    </article>
  )
}

function BookingRequestForm({ services, selectedServiceId, onServiceChange, onCreated }) {
  const [preferredDate, setPreferredDate] = useState('')
  const [slots, setSlots] = useState([])
  const [selectedSlotKey, setSelectedSlotKey] = useState('')
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [slotError, setSlotError] = useState('')
  const [patientNote, setPatientNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const today = new Date(Date.now() + 8 * 60 * 60_000).toISOString().slice(0, 10)
  const slotKey = (slot) => `${slot.dentistId}|${slot.startsAt}`
  const selectedSlot = slots.find((slot) => slotKey(slot) === selectedSlotKey)

  useEffect(() => {
    setSlots([])
    setSelectedSlotKey('')
    setSlotError('')
    if (!preferredDate) return undefined

    let active = true
    setLoadingSlots(true)
    api.getAvailability(preferredDate)
      .then((result) => {
        if (active) setSlots(listFrom(result, 'slots'))
      })
      .catch((requestError) => {
        if (active) setSlotError(requestError.message || 'Available times could not be loaded.')
      })
      .finally(() => {
        if (active) setLoadingSlots(false)
      })
    return () => { active = false }
  }, [preferredDate])

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSuccess('')
    if (!selectedServiceId || !preferredDate || !selectedSlot) {
      setError('Choose a service, date, and available appointment time to continue.')
      return
    }

    setSubmitting(true)
    try {
      const result = await api.createAppointmentRequest({
        appointmentTypeId: selectedServiceId,
        dentistId: selectedSlot.dentistId,
        startsAt: selectedSlot.startsAt,
        patientNote,
      })
      const appointmentRequest = appointmentRequestView(result?.appointmentRequest || result)
      onCreated(appointmentRequest)
      setPreferredDate('')
      setPatientNote('')
      setSuccess('Your appointment request was sent for the selected doctor and one-hour time slot.')
    } catch (requestError) {
      setError(requestError.message || 'We could not send your appointment request. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="rounded-3xl bg-white p-5 soft-shadow sm:p-6" aria-labelledby="booking-heading">
      <div className="mb-5">
        <p className="text-xs font-extrabold uppercase tracking-[.18em] text-brand/60">Request a visit</p>
        <h2 id="booking-heading" className="mt-1 text-xl font-extrabold">Book an appointment</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-ink/50">
          Choose a date to see each doctor’s live one-hour schedule. Booked times are disabled, and the clinic will confirm your request.
        </p>
      </div>

      {!services.length ? (
        <p className="rounded-2xl bg-cream/60 p-5 text-center text-sm text-ink/50">
          Services are temporarily unavailable. Please call the clinic to arrange care.
        </p>
      ) : (
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-extrabold" htmlFor="appointment-service">Service</label>
              <select
                id="appointment-service"
                className="w-full rounded-2xl border border-ink/10 bg-cream/45 px-4 py-3 text-sm font-semibold text-ink outline-none transition focus:border-brand/40 focus:bg-white focus:ring-4 focus:ring-brand/10"
                value={selectedServiceId}
                onChange={(event) => onServiceChange(event.target.value)}
                disabled={submitting}
                required
              >
                <option value="">Choose a service</option>
                {services.map((service) => (
                  <option key={service.id} value={service.id}>{service.name}</option>
                ))}
              </select>
              {selectedServiceId && (
                <p className="mt-2 text-xs leading-5 text-ink/45">
                  {services.find((service) => service.id === selectedServiceId)?.description}
                </p>
              )}
            </div>

            <div>
              <label className="mb-2 block text-sm font-extrabold" htmlFor="preferred-date">Preferred date</label>
              <input
                id="preferred-date"
                className="w-full rounded-2xl border border-ink/10 bg-cream/45 px-4 py-3 text-sm font-semibold text-ink outline-none transition focus:border-brand/40 focus:bg-white focus:ring-4 focus:ring-brand/10"
                type="date"
                min={today}
                value={preferredDate}
                onChange={(event) => setPreferredDate(event.target.value)}
                disabled={submitting}
                required
              />
            </div>
          </div>

          {preferredDate && (
            <fieldset>
              <legend className="mb-2 text-sm font-extrabold">Available one-hour times</legend>
              <p className="mb-3 text-xs leading-5 text-ink/45">Monday–Saturday, 9:00 AM–5:00 PM · Manila time</p>
              {loadingSlots ? (
                <p className="rounded-2xl bg-cream/60 p-4 text-sm text-ink/50" role="status">Checking doctor schedules…</p>
              ) : slotError ? (
                <p className="rounded-2xl bg-[#fff0e7] p-4 text-sm text-[#914b22]" role="alert">{slotError}</p>
              ) : slots.length ? (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {slots.map((slot) => {
                    const key = slotKey(slot)
                    const selected = key === selectedSlotKey
                    return (
                      <button
                        key={key}
                        className={`rounded-2xl border p-3 text-left transition ${
                          selected
                            ? 'border-brand bg-brand text-white shadow-lg shadow-teal-900/15'
                            : slot.available
                              ? 'border-brand/15 bg-mint/45 text-ink hover:border-brand/40 hover:bg-mint'
                              : 'cursor-not-allowed border-ink/6 bg-ink/5 text-ink/30 line-through'
                        }`}
                        type="button"
                        disabled={!slot.available || submitting}
                        aria-pressed={selected}
                        onClick={() => setSelectedSlotKey(key)}
                      >
                        <span className="block text-sm font-extrabold">{formatTime(slot.startsAt)} – {formatTime(slot.endsAt)}</span>
                        <span className="mt-1 block text-[11px] font-semibold">{slot.dentistName}{slot.available ? '' : ' · Unavailable'}</span>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <p className="rounded-2xl bg-cream/60 p-4 text-sm text-ink/50">The clinic is closed or no doctor schedule is available on this date.</p>
              )}
            </fieldset>
          )}

          <div>
            <label className="mb-2 block text-sm font-extrabold" htmlFor="patient-note">Note for the clinic <span className="font-normal text-ink/40">(optional)</span></label>
            <input
              id="patient-note"
              className="w-full rounded-2xl border border-ink/10 bg-cream/45 px-4 py-3 text-sm text-ink outline-none transition focus:border-brand/40 focus:bg-white focus:ring-4 focus:ring-brand/10"
              type="text"
              maxLength={1000}
              placeholder="Anything we should know?"
              value={patientNote}
              onChange={(event) => setPatientNote(event.target.value)}
              disabled={submitting}
            />
          </div>

          {error && <p className="rounded-2xl bg-[#fff0e7] px-4 py-3 text-sm leading-6 text-[#914b22]" role="alert">{error}</p>}
          {success && <p className="rounded-2xl bg-mint px-4 py-3 text-sm leading-6 text-brand" role="status">{success}</p>}

          <button className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-extrabold text-white shadow-lg shadow-teal-900/15 hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60" type="submit" disabled={submitting}>
            {submitting ? 'Sending request…' : 'Request appointment'}
            {!submitting && <CalendarCheck2 size={17} />}
          </button>
        </form>
      )}
    </section>
  )
}

function AppointmentRequestCard({ value }) {
  const request = appointmentRequestView(value)
  return (
    <article className="rounded-2xl border border-ink/6 bg-cream/45 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-extrabold">{request.serviceName}</h3>
          <p className="mt-1 text-xs text-ink/50">
            {request.requestedStartAt
              ? `${formatDate(request.requestedStartAt, { weekday: 'long' })} · ${formatTime(request.requestedStartAt)} – ${formatTime(request.requestedEndAt)}${request.dentistName ? ` · ${request.dentistName}` : ''}`
              : `Preferred: ${formatDate(request.preferredDate)} · ${timePreferenceLabels[request.timePreference] || titleCase(request.timePreference)}`}
          </p>
        </div>
        <span className={`self-start rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide sm:self-auto ${requestStatusColors[request.status] || 'bg-cream text-ink/55'}`}>
          {titleCase(request.status)}
        </span>
      </div>
      {request.clinicNote && <p className="mt-3 rounded-xl bg-white/70 px-3 py-2 text-xs leading-5 text-ink/55">{request.clinicNote}</p>}
    </article>
  )
}

export default function AppointmentsPage() {
  const [searchParams] = useSearchParams()
  const [upcoming, setUpcoming] = useState([])
  const [past, setPast] = useState([])
  const [services, setServices] = useState([])
  const [appointmentRequests, setAppointmentRequests] = useState([])
  const [selectedServiceId, setSelectedServiceId] = useState(searchParams.get('service') || '')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [upcomingPayload, pastPayload, servicesPayload, requestPayload] = await Promise.all([
        api.getAppointments('upcoming'),
        api.getAppointments('past'),
        api.getServices(),
        api.getAppointmentRequests(),
      ])
      setUpcoming(appointmentsFrom(upcomingPayload, 'upcoming'))
      setPast(appointmentsFrom(pastPayload, 'past'))
      setServices(listFrom(servicesPayload, 'services').map(serviceView))
      setAppointmentRequests(listFrom(requestPayload, 'appointmentRequests').map(appointmentRequestView))
    } catch (requestError) {
      setError(requestError)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const requestedService = searchParams.get('service')
    if (requestedService && services.some((service) => service.id === requestedService)) {
      setSelectedServiceId(requestedService)
    }
  }, [searchParams, services])

  return (
    <>
      <section className="mb-8">
        <p className="text-xs font-extrabold uppercase tracking-[.18em] text-brand/60">Your schedule</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">Appointments</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-ink/50">
          Review visits arranged by the clinic. Call us if you need help moving an appointment.
        </p>
      </section>

      {loading ? (
        <LoadingState label="Loading your appointments…" />
      ) : error ? (
        <ErrorState error={error} onRetry={load} />
      ) : (
        <>
          {appointmentRequests.length > 0 && (
            <section className="mb-10" aria-labelledby="booking-requests-heading">
              <div className="mb-4 flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-2xl bg-mint text-brand">
                  <CalendarClock size={19} />
                </div>
                <div>
                  <h2 id="booking-requests-heading" className="text-xl font-extrabold">My booking requests</h2>
                  <p className="text-xs text-ink/45">The clinic will update you here after reviewing your request</p>
                </div>
              </div>
              <div className="space-y-3">
                {appointmentRequests.map((request) => <AppointmentRequestCard key={request.id} value={request} />)}
              </div>
            </section>
          )}

        <div className="space-y-10">
          <section aria-labelledby="upcoming-heading">
            <div className="mb-4 flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-2xl bg-mint text-brand">
                <CalendarClock size={19} />
              </div>
              <div>
                <h2 id="upcoming-heading" className="text-xl font-extrabold">Upcoming</h2>
                <p className="text-xs text-ink/45">{upcoming.length} scheduled visit{upcoming.length === 1 ? '' : 's'}</p>
              </div>
            </div>
            {upcoming.length ? (
              <div className="space-y-4">
                {upcoming.map((appointment) => (
                  <AppointmentCard key={appointment.id} value={appointment} upcoming />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={CalendarX2}
                title="No upcoming appointments"
                message="There are no visits on your schedule. Call the clinic if you need assistance arranging care."
                action={(
                  <ClinicPhoneLink className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-xs font-extrabold text-white">
                    <Phone size={14} />
                    Call clinic
                  </ClinicPhoneLink>
                )}
              />
            )}
          </section>

          <BookingRequestForm
            services={services}
            selectedServiceId={selectedServiceId}
            onServiceChange={setSelectedServiceId}
            onCreated={(request) => setAppointmentRequests((current) => [request, ...current])}
          />

          <section aria-labelledby="past-heading">
            <div className="mb-4 flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-2xl bg-white text-brand">
                <History size={19} />
              </div>
              <div>
                <h2 id="past-heading" className="text-xl font-extrabold">Past appointments</h2>
                <p className="text-xs text-ink/45">Your previous clinic visits</p>
              </div>
            </div>
            {past.length ? (
              <div className="space-y-4">
                {past.map((appointment) => (
                  <AppointmentCard key={appointment.id} value={appointment} upcoming={false} />
                ))}
              </div>
            ) : (
              <EmptyState
                title="No past appointments to show"
                message="Completed and previous visits will appear here once they are available."
              />
            )}
          </section>
        </div>
        </>
      )}
    </>
  )
}
