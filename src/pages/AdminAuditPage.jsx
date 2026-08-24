import { useCallback, useEffect, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { api } from '../api'
import { ErrorState, LoadingState } from '../components/PageState'
import { formatDateTime, titleCase } from '../format'

export default function AdminAuditPage() {
  const [state, setState] = useState({ loading: true, events: [], error: null })
  const load = useCallback(() => {
    setState((current) => ({ ...current, loading: true, error: null }))
    api.getAdminAudit().then(({ events }) => setState({ loading: false, events, error: null })).catch((error) => setState({ loading: false, events: [], error }))
  }, [])
  useEffect(load, [load])
  if (state.loading && !state.events.length) return <LoadingState label="Loading administrative audit history…" />
  if (state.error) return <ErrorState error={state.error} onRetry={load} />
  return <><div className="mb-8"><p className="text-xs font-extrabold uppercase tracking-[.18em] text-brand/60">Accountability</p><h1 className="mt-2 text-3xl font-extrabold tracking-tight">Audit log</h1><p className="mt-2 text-sm text-ink/50">Privacy-safe history of super-admin access and account changes.</p></div><section className="overflow-hidden rounded-3xl bg-white soft-shadow"><div className="divide-y divide-ink/5">{state.events.map((event) => <article className="flex gap-4 px-5 py-4" key={event.id}><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-mint text-brand"><ShieldCheck size={18} /></div><div><h2 className="text-sm font-extrabold">{titleCase(event.action.replace('admin.', ''))}</h2><p className="mt-1 text-xs text-ink/45">{event.actorName} · {formatDateTime(event.occurredAt)}{event.objectType ? ` · ${titleCase(event.objectType)}` : ''}</p></div></article>)}{!state.events.length && <p className="p-6 text-sm text-ink/45">No super-admin activity has been recorded yet.</p>}</div></section></>
}
