import { useCallback, useEffect, useState } from 'react'
import { CalendarDays, Clock3 } from 'lucide-react'
import { api } from '../api'
import { EmptyState, ErrorState, LoadingState } from '../components/PageState'
import { formatTime } from '../format'

const manilaToday = () => new Date(Date.now() + 8 * 60 * 60_000).toISOString().slice(0, 10)

export default function ReceptionCalendarPage() {
  const [date, setDate] = useState(manilaToday)
  const [state, setState] = useState({ loading: true, data: null, error: null })
  const load = useCallback(() => {
    setState({ loading: true, data: null, error: null })
    api.getReceptionCalendar(date)
      .then((data) => setState({ loading: false, data, error: null }))
      .catch((error) => setState({ loading: false, data: null, error }))
  }, [date])
  useEffect(load, [load])

  const appointments = state.data?.appointments || []
  const requests = state.data?.appointmentRequests || []
  const items = [
    ...appointments.map((item) => ({ ...item, kind: 'Confirmed', time: item.startsAt })),
    ...requests.map((item) => ({ ...item, kind: 'Pending request', time: item.requestedStartAt })),
  ].sort((a, b) => String(a.time).localeCompare(String(b.time)))

  return <>
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-xs font-extrabold uppercase tracking-[.18em] text-brand/60">Clinic schedule</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Appointment calendar</h1>
        <p className="mt-2 text-sm text-ink/50">Confirmed visits and pending requests for all dentists.</p>
      </div>
      <label className="text-sm font-extrabold">Date
        <input className="ml-3 rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
      </label>
    </div>
    {state.loading ? <LoadingState label="Loading the clinic calendar…" />
      : state.error ? <ErrorState error={state.error} onRetry={load} />
        : !items.length ? <EmptyState icon={CalendarDays} title="The schedule is clear" message="There are no confirmed visits or pending requests on this date." />
          : <div className="space-y-3">
            {items.map((item) => (
              <article className="flex flex-col gap-4 rounded-3xl bg-white p-5 soft-shadow sm:flex-row sm:items-center" key={`${item.kind}-${item.id}`}>
                <div className={`grid h-14 w-24 shrink-0 place-items-center rounded-2xl ${item.kind === 'Confirmed' ? 'bg-brand text-white' : 'bg-mint text-brand'}`}>
                  <span className="flex items-center gap-1 text-sm font-extrabold"><Clock3 size={15} />{formatTime(item.time)}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-extrabold">{item.patient.displayName}</h2>
                    <span className="rounded-full bg-cream px-2 py-1 text-[10px] font-extrabold uppercase text-ink/45">{item.kind}</span>
                  </div>
                  <p className="mt-1 text-sm text-ink/50">{item.typeName || item.serviceName} · {item.dentistName}</p>
                </div>
                <p className="text-xs font-bold text-ink/40">{item.patient.patientNumber}</p>
              </article>
            ))}
          </div>}
  </>
}
