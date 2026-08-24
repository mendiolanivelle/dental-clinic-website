import { useCallback, useEffect, useState } from 'react'
import { CalendarCheck2, ClipboardList, Clock3, UsersRound } from 'lucide-react'
import { Link, useOutletContext } from 'react-router-dom'
import { api } from '../api'
import { ErrorState, LoadingState } from '../components/PageState'
import { formatTime } from '../format'

export default function ReceptionDashboardPage() {
  const { staff } = useOutletContext()
  const [state, setState] = useState({ loading: true, data: null, error: null })
  const load = useCallback(() => {
    setState({ loading: true, data: null, error: null })
    api.getReceptionDashboard()
      .then((data) => setState({ loading: false, data, error: null }))
      .catch((error) => setState({ loading: false, data: null, error }))
  }, [])
  useEffect(load, [load])

  if (state.loading) return <LoadingState label="Loading today’s clinic activity…" />
  if (state.error) return <ErrorState error={state.error} onRetry={load} />
  const { pendingRequests = 0, todayAppointments = [], todayRequests = [] } = state.data

  return <>
    <div className="mb-8">
      <p className="text-xs font-extrabold uppercase tracking-[.18em] text-brand/60">Reception overview</p>
      <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Good day, {staff.displayName.split(' ')[0]}</h1>
      <p className="mt-2 text-sm text-ink/50">Here is what needs attention at the clinic today.</p>
    </div>

    <div className="grid gap-4 sm:grid-cols-3">
      {[
        ['Pending requests', pendingRequests, ClipboardList, '/reception/requests'],
        ["Today's appointments", todayAppointments.length, CalendarCheck2, '/reception/calendar'],
        ["Today's new requests", todayRequests.length, Clock3, '/reception/requests'],
      ].map(([label, value, Icon, to]) => (
        <Link className="card-hover rounded-3xl bg-white p-5 soft-shadow" to={to} key={label}>
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-mint text-brand"><Icon size={21} /></div>
          <p className="mt-5 text-3xl font-extrabold">{value}</p>
          <p className="mt-1 text-sm font-semibold text-ink/50">{label}</p>
        </Link>
      ))}
    </div>

    <section className="mt-8 rounded-3xl bg-white p-5 soft-shadow sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[.16em] text-brand/60">Today</p>
          <h2 className="mt-1 text-xl font-extrabold">Confirmed appointments</h2>
        </div>
        <Link className="text-sm font-extrabold text-brand" to="/reception/calendar">Open calendar</Link>
      </div>
      {todayAppointments.length ? (
        <div className="mt-5 divide-y divide-ink/8">
          {todayAppointments.map((appointment) => (
            <div className="flex flex-col gap-2 py-4 first:pt-0 sm:flex-row sm:items-center" key={appointment.id}>
              <p className="w-28 text-sm font-extrabold text-brand">{formatTime(appointment.startsAt)}</p>
              <div className="min-w-0 flex-1">
                <p className="font-extrabold">{appointment.patient.displayName}</p>
                <p className="text-xs text-ink/45">{appointment.typeName} · {appointment.dentistName}</p>
              </div>
              <p className="text-xs font-bold text-ink/40">{appointment.patient.patientNumber}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-5 flex items-center gap-3 rounded-2xl bg-cream/70 p-4 text-sm text-ink/50"><UsersRound size={19} /> No confirmed appointments today.</div>
      )}
    </section>
  </>
}
