import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CalendarDays, Clock3, Search, UsersRound } from 'lucide-react'
import { Link, useOutletContext } from 'react-router-dom'
import { api } from '../api'
import { ErrorState, LoadingState } from '../components/PageState'
import { formatDateTime, formatTime, titleCase } from '../format'

export default function DentistDashboardPage() {
  const { staff } = useOutletContext()
  const [state, setState] = useState({ loading: true, appointments: [], upcomingAppointments: [], error: null })
  const load = useCallback(() => {
    setState({ loading: true, appointments: [], upcomingAppointments: [], error: null })
    api.getDentistDashboard()
      .then(({ appointments = [], upcomingAppointments = [] }) => setState({ loading: false, appointments, upcomingAppointments, error: null }))
      .catch((error) => setState({ loading: false, appointments: [], upcomingAppointments: [], error }))
  }, [])
  useEffect(load, [load])

  if (state.loading) return <LoadingState label="Loading today’s patients…" />
  if (state.error) return <ErrorState error={state.error} onRetry={load} />

  return <>
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-xs font-extrabold uppercase tracking-[.18em] text-brand/60">Dentist overview</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Good day, {staff.displayName}</h1>
        <p className="mt-2 text-sm text-ink/50">Review your patients and open their clinical workspace.</p>
      </div>
      <Link className="inline-flex items-center justify-center gap-2 rounded-2xl bg-brand px-5 py-3 text-sm font-extrabold text-white" to="/dentist/patients">
        <Search size={17} /> Find a patient
      </Link>
    </div>

    <div className="grid gap-4 sm:grid-cols-2">
      <section className="rounded-3xl bg-white p-5 soft-shadow">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-mint text-brand"><CalendarDays size={21} /></div>
        <p className="mt-5 text-3xl font-extrabold">{state.appointments.length}</p>
        <p className="mt-1 text-sm font-semibold text-ink/50">Patients on today’s schedule</p>
      </section>
      <section className="rounded-3xl bg-white p-5 soft-shadow">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#f4dfc9] text-[#915020]"><Clock3 size={21} /></div>
        <p className="mt-5 text-3xl font-extrabold">{state.appointments.filter(({ status }) => status !== 'completed').length}</p>
        <p className="mt-1 text-sm font-semibold text-ink/50">Visits still in progress</p>
      </section>
    </div>

    <section className="mt-8 rounded-3xl bg-white p-5 soft-shadow sm:p-6">
      <div>
        <p className="text-xs font-extrabold uppercase tracking-[.16em] text-brand/60">Today</p>
        <h2 className="mt-1 text-xl font-extrabold">Assigned patients</h2>
      </div>
      {state.appointments.length ? <div className="mt-5 divide-y divide-ink/8">
        {state.appointments.map((appointment) => {
          const patient = appointment.patient
          const hasAlert = Boolean(patient.allergies || patient.medicalConditions || patient.currentMedications)
          return <Link className="flex flex-col gap-3 py-4 first:pt-0 hover:text-brand sm:flex-row sm:items-center" key={appointment.id} to={`/dentist/patients/${patient.id}`}>
            <p className="w-24 text-sm font-extrabold text-brand">{formatTime(appointment.startsAt)}</p>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-extrabold">{patient.displayName}</p>
                {hasAlert && <span className="inline-flex items-center gap-1 rounded-full bg-[#fff0e7] px-2 py-1 text-[10px] font-extrabold uppercase text-[#914b22]"><AlertTriangle size={11} /> Medical alert</span>}
              </div>
              <p className="mt-1 text-xs text-ink/45">{appointment.typeName} · Age {patient.age ?? 'not recorded'} · {titleCase(patient.gender || 'not recorded')}</p>
            </div>
            <p className="text-xs font-bold text-ink/40">{patient.patientNumber}</p>
          </Link>
        })}
      </div> : <div className="mt-5 flex items-center gap-3 rounded-2xl bg-cream/70 p-4 text-sm text-ink/50"><UsersRound size={19} /> No assigned appointments today.</div>}
    </section>

    <section className="mt-8 rounded-3xl bg-white p-5 soft-shadow sm:p-6">
      <div><p className="text-xs font-extrabold uppercase tracking-[.16em] text-brand/60">Future schedule</p><h2 className="mt-1 text-xl font-extrabold">Confirmed upcoming visits</h2><p className="mt-1 text-xs text-ink/45">These occupied times are blocked automatically from new bookings.</p></div>
      {state.upcomingAppointments.length ? <div className="mt-5 divide-y divide-ink/8">{state.upcomingAppointments.map((appointment) => <Link className="flex flex-col gap-2 py-4 first:pt-0 hover:text-brand sm:flex-row sm:items-center" key={appointment.id} to={`/dentist/patients/${appointment.patient.id}`}><p className="w-56 text-sm font-extrabold text-brand">{formatDateTime(appointment.startsAt)}</p><div className="min-w-0 flex-1"><p className="font-extrabold">{appointment.patient.displayName}</p><p className="mt-1 text-xs text-ink/45">{appointment.typeName} · {appointment.patient.patientNumber}</p></div></Link>)}</div> : <div className="mt-5 flex items-center gap-3 rounded-2xl bg-cream/70 p-4 text-sm text-ink/50"><CalendarDays size={19} /> No future confirmed appointments.</div>}
    </section>
  </>
}
