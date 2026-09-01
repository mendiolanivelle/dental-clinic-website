import { useCallback, useEffect, useState } from 'react'
import { LogIn, LogOut } from 'lucide-react'
import { api } from '../api'
import { ErrorState, LoadingState } from '../components/PageState'
import { formatDateTime } from '../format'

const categoryLabels = {
  patient: 'Patient',
  doctor: 'Doctor',
  receptionist: 'Receptionist',
  superadmin: 'Super Admin',
}

export default function AdminAuditPage() {
  const [state, setState] = useState({ loading: true, events: [], error: null })
  const load = useCallback(() => {
    setState((current) => ({ ...current, loading: true, error: null }))
    api.getAdminAudit().then(({ events }) => setState({ loading: false, events, error: null })).catch((error) => setState({ loading: false, events: [], error }))
  }, [])
  useEffect(load, [load])
  if (state.loading && !state.events.length) return <LoadingState label="Loading login history…" />
  if (state.error) return <ErrorState error={state.error} onRetry={load} />
  return <><div className="mb-8"><p className="text-xs font-extrabold uppercase tracking-[.18em] text-brand/60">Accountability</p><h1 className="mt-2 text-3xl font-extrabold tracking-tight">Audit log</h1><p className="mt-2 text-sm text-ink/50">Login and logout history for patients, doctors, receptionists, and super admins.</p></div><section className="overflow-hidden rounded-3xl bg-white soft-shadow"><div className="divide-y divide-ink/5">{state.events.map((event) => { const Icon = event.activity === 'login' ? LogIn : LogOut; return <article className="flex gap-4 px-5 py-4" key={event.id}><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-mint text-brand"><Icon size={18} /></div><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-extrabold">{event.actorName}</h2><span className="rounded-full bg-cream px-2 py-1 text-[10px] font-extrabold uppercase text-brand">{categoryLabels[event.category]}</span></div><p className="mt-1 text-xs text-ink/45">{event.activity === 'login' ? 'Logged in' : 'Logged out'} · {formatDateTime(event.occurredAt)}</p></div></article> })}{!state.events.length && <p className="p-6 text-sm text-ink/45">No login or logout activity has been recorded yet.</p>}</div></section></>
}
