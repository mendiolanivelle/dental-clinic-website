import { useCallback, useEffect, useState } from 'react'
import {
  CalendarClock,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  IdCard,
  Phone,
  Stethoscope,
  X,
} from 'lucide-react'
import { api } from '../api'
import { ErrorState, LoadingState } from '../components/PageState'
import { calendarWeek, formatDate, formatTime, titleCase } from '../format'

const manilaToday = () => new Date(Date.now() + 8 * 60 * 60_000).toISOString().slice(0, 10)
const shiftDate = (date, days) => {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}
const hourlyTimes = Array.from({ length: 8 }, (_, index) => `${String(index + 9).padStart(2, '0')}:00`)
const manilaDateTime = (value) => {
  const local = new Date(new Date(value).getTime() + 8 * 60 * 60_000).toISOString()
  return { date: local.slice(0, 10), time: local.slice(11, 16) }
}

const dayItems = (day) => [
  ...(day.appointments || []).map((item) => ({
    ...item,
    kind: 'appointment',
    kindLabel: `${titleCase(item.status)} appointment`,
    time: item.startsAt,
  })),
  ...(day.appointmentRequests || []).map((item) => ({
    ...item,
    kind: 'request',
    kindLabel: 'Pending request',
    time: item.requestedStartAt,
  })),
].sort((a, b) => String(a.time).localeCompare(String(b.time)))

function BookingDetails({ booking, close, onRescheduled }) {
  const initialSchedule = manilaDateTime(booking.time)
  const [editing, setEditing] = useState(false)
  const [date, setDate] = useState(initialSchedule.date)
  const [time, setTime] = useState(initialSchedule.time)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    const onKeyDown = (event) => event.key === 'Escape' && close()
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [close])

  const serviceName = booking.typeName || booking.serviceName
  const endTime = booking.endsAt || booking.requestedEndAt
  const canReschedule = booking.kind === 'appointment' && ['scheduled', 'confirmed'].includes(booking.status)

  const submitReschedule = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.rescheduleReceptionAppointment(booking.id, new Date(`${date}T${time}:00+08:00`).toISOString())
      await onRescheduled()
    } catch (requestError) {
      setError(requestError.message || 'The appointment could not be rescheduled.')
    } finally {
      setBusy(false)
    }
  }

  return <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && close()}>
    <section aria-labelledby="booking-details-title" aria-modal="true" className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[30px] bg-white p-6 soft-shadow sm:p-8" role="dialog">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[.16em] text-brand/60">{booking.kindLabel}</p>
          <h2 className="mt-2 text-2xl font-extrabold" id="booking-details-title">{serviceName}</h2>
        </div>
        <button aria-label="Close booking details" className="rounded-xl bg-cream p-2.5 text-ink/55 hover:bg-mint hover:text-brand" onClick={close} type="button"><X size={19} /></button>
      </div>

      <div className="mt-6 rounded-2xl bg-brand p-5 text-white">
        <p className="text-sm font-extrabold">{formatDate(booking.time, { weekday: 'long' })}</p>
        <p className="mt-1 flex items-center gap-2 text-sm text-white/75"><Clock3 size={16} />{formatTime(booking.time)}{endTime ? ` – ${formatTime(endTime)}` : ''}</p>
      </div>

      <dl className="mt-6 grid gap-4 sm:grid-cols-2">
        <div><dt className="text-xs font-bold text-ink/40">Patient</dt><dd className="mt-1 font-extrabold">{booking.patient.displayName}</dd></div>
        <div><dt className="flex items-center gap-1.5 text-xs font-bold text-ink/40"><IdCard size={14} /> Patient ID</dt><dd className="mt-1 font-extrabold">{booking.patient.patientNumber}</dd></div>
        <div><dt className="flex items-center gap-1.5 text-xs font-bold text-ink/40"><Stethoscope size={14} /> Dentist</dt><dd className="mt-1 font-extrabold">{booking.dentistName || 'To be assigned'}</dd></div>
        <div><dt className="flex items-center gap-1.5 text-xs font-bold text-ink/40"><Phone size={14} /> Phone</dt><dd className="mt-1 font-extrabold">{booking.patient.phone || 'Not provided'}</dd></div>
      </dl>

      {(booking.patientNote || booking.clinicNote) && <div className="mt-6 space-y-3 border-t border-ink/8 pt-5">
        {booking.patientNote && <div><p className="text-xs font-extrabold uppercase tracking-[.14em] text-ink/40">Patient note</p><p className="mt-1 text-sm leading-6 text-ink/65">{booking.patientNote}</p></div>}
        {booking.clinicNote && <div><p className="text-xs font-extrabold uppercase tracking-[.14em] text-ink/40">Clinic note</p><p className="mt-1 text-sm leading-6 text-ink/65">{booking.clinicNote}</p></div>}
      </div>}

      {canReschedule && !editing && <button className="mt-6 inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-extrabold text-white hover:bg-brand-dark" type="button" onClick={() => setEditing(true)}><CalendarClock size={17} /> Change schedule</button>}
      {editing && <form className="mt-6 rounded-2xl bg-cream/70 p-4" onSubmit={submitReschedule}>
        <p className="text-sm font-extrabold">Choose a new one-hour schedule</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-extrabold text-ink/55">Date
            <input className="mt-2 w-full rounded-xl border border-ink/10 bg-white px-3 py-2.5 text-sm font-semibold text-ink" type="date" min={manilaToday()} required value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
          <label className="text-xs font-extrabold text-ink/55">Time
            <select className="mt-2 w-full rounded-xl border border-ink/10 bg-white px-3 py-2.5 text-sm font-semibold text-ink" required value={time} onChange={(event) => setTime(event.target.value)}>
              {hourlyTimes.map((value) => <option key={value} value={value}>{formatTime(new Date(`2000-01-01T${value}:00+08:00`))}</option>)}
            </select>
          </label>
        </div>
        {error && <p className="mt-3 rounded-xl bg-[#fff0e7] p-3 text-sm text-[#914b22]" role="alert">{error}</p>}
        <div className="mt-4 flex gap-2">
          <button className="rounded-xl bg-brand px-4 py-2.5 text-xs font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-50" disabled={busy || (date === initialSchedule.date && time === initialSchedule.time)} type="submit">{busy ? 'Saving…' : 'Save new schedule'}</button>
          <button className="rounded-xl px-4 py-2.5 text-xs font-extrabold text-ink/50" disabled={busy} type="button" onClick={() => { setEditing(false); setError('') }}>Cancel</button>
        </div>
      </form>}
    </section>
  </div>
}

export default function ReceptionCalendarPage() {
  const today = manilaToday()
  const [weekStart, setWeekStart] = useState(() => calendarWeek(today)[0])
  const [selected, setSelected] = useState(null)
  const [message, setMessage] = useState('')
  const [state, setState] = useState({ loading: true, days: [], error: null })

  const load = useCallback(async () => {
    setState({ loading: true, days: [], error: null })
    try {
      const dates = calendarWeek(weekStart)
      const calendars = await Promise.all(dates.map((date) => api.getReceptionCalendar(date)))
      setState({
        loading: false,
        error: null,
        days: calendars.map((calendar, index) => ({ date: dates[index], items: dayItems(calendar) })),
      })
    } catch (error) {
      setState({ loading: false, days: [], error })
    }
  }, [weekStart])
  useEffect(() => { load() }, [load])

  const weekDates = calendarWeek(weekStart)
  const weekEnd = weekDates[6]

  return <>
    <div className="mb-8 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
      <div>
        <p className="text-xs font-extrabold uppercase tracking-[.18em] text-brand/60">Clinic schedule</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Weekly appointment calendar</h1>
        <p className="mt-2 text-sm text-ink/50">Sunday to Saturday · Select a booking to view its details.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button aria-label="Previous week" className="rounded-xl bg-white p-2.5 text-brand shadow-sm hover:bg-mint" onClick={() => setWeekStart(shiftDate(weekStart, -7))} type="button"><ChevronLeft size={19} /></button>
        <button className="rounded-xl bg-white px-4 py-2.5 text-xs font-extrabold text-brand shadow-sm hover:bg-mint" onClick={() => setWeekStart(calendarWeek(today)[0])} type="button">This week</button>
        <button aria-label="Next week" className="rounded-xl bg-white p-2.5 text-brand shadow-sm hover:bg-mint" onClick={() => setWeekStart(shiftDate(weekStart, 7))} type="button"><ChevronRight size={19} /></button>
        <label className="ml-0 text-xs font-extrabold text-ink/50 sm:ml-2">Jump to date
          <input className="ml-2 rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm text-ink" type="date" value={weekStart} onChange={(event) => setWeekStart(calendarWeek(event.target.value)[0] || weekStart)} />
        </label>
      </div>
    </div>

    <div className="mb-5 flex items-center gap-2 text-sm font-extrabold text-ink/65">
      <CalendarDays className="text-brand" size={19} />
      {formatDate(weekStart)} – {formatDate(weekEnd)}
    </div>

    {message && <p className="mb-5 rounded-2xl bg-mint p-4 text-sm font-bold text-brand" role="status">{message}</p>}

    {state.loading ? <LoadingState label="Loading this week’s clinic calendar…" />
      : state.error ? <ErrorState error={state.error} onRetry={load} />
        : <div className="space-y-4" aria-label="Weekly schedule">
          {state.days.map((day) => <section className={`rounded-3xl border bg-white p-4 soft-shadow sm:p-5 ${day.date === today ? 'border-brand/25' : 'border-transparent'}`} key={day.date}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-ink/6 pb-4">
              <div><h2 className="text-lg font-extrabold">{formatDate(day.date, { weekday: 'long' })}</h2><p className="mt-1 text-xs text-ink/40">{day.items.length} booking{day.items.length === 1 ? '' : 's'}</p></div>
              {day.date === today && <span className="rounded-full bg-mint px-3 py-1 text-[10px] font-extrabold uppercase tracking-wide text-brand">Today</span>}
            </div>
            {day.items.length ? <div className="space-y-2">
              {day.items.map((item) => <button aria-haspopup="dialog" className={`group flex w-full flex-col gap-3 rounded-2xl p-4 text-left transition hover:bg-mint/60 focus:outline-none focus:ring-4 focus:ring-brand/10 sm:flex-row sm:items-center ${item.status === 'completed' ? 'bg-[#edf7f1]' : 'bg-cream/55'}`} key={`${item.kind}-${item.id}`} onClick={() => setSelected(item)} type="button">
                <div className={`flex w-full shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-extrabold sm:w-28 ${item.status === 'completed' ? 'bg-[#3f8060] text-white' : item.kind === 'appointment' ? 'bg-brand text-white' : 'bg-white text-brand'}`}><Clock3 size={15} />{formatTime(item.time)}</div>
                <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-extrabold group-hover:text-brand">{item.patient.displayName}</h3><span className={`rounded-full px-2 py-1 text-[10px] font-extrabold uppercase ${item.status === 'completed' ? 'bg-[#d7ecdf] text-[#2f6b4d]' : 'bg-white text-ink/45'}`}>{item.kindLabel}</span></div><p className="mt-1 text-sm text-ink/50">{item.typeName || item.serviceName} · {item.dentistName}</p></div>
                <span className="text-xs font-bold text-ink/35">View details</span>
              </button>)}
            </div> : <p className="rounded-2xl bg-cream/40 px-4 py-5 text-center text-sm text-ink/40">No bookings scheduled.</p>}
          </section>)}
        </div>}

    {selected && <BookingDetails booking={selected} close={() => setSelected(null)} onRescheduled={async () => { setSelected(null); setMessage('Appointment schedule updated.'); await load() }} />}
  </>
}
