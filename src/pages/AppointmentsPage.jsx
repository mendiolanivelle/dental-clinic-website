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
import { api } from '../api'
import ClinicPhoneLink from '../components/ClinicPhoneLink'
import { EmptyState, ErrorState, LoadingState } from '../components/PageState'
import { formatDate, formatTime, titleCase } from '../format'
import { appointmentView, listFrom } from '../portalData'

const statusColors = {
  scheduled: 'bg-[#e9e7f8] text-[#66569f]',
  confirmed: 'bg-mint text-brand',
  completed: 'bg-[#e6f0fa] text-[#376b95]',
  cancelled: 'bg-[#fff0e7] text-[#9a4e22]',
  no_show: 'bg-ink/8 text-ink/55',
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

export default function AppointmentsPage() {
  const [upcoming, setUpcoming] = useState([])
  const [past, setPast] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [upcomingPayload, pastPayload] = await Promise.all([
        api.getAppointments('upcoming'),
        api.getAppointments('past'),
      ])
      setUpcoming(appointmentsFrom(upcomingPayload, 'upcoming'))
      setPast(appointmentsFrom(pastPayload, 'past'))
    } catch (requestError) {
      setError(requestError)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

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
      )}
    </>
  )
}
