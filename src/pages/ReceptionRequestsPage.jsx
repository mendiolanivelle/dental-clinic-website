import { useCallback, useEffect, useState } from 'react'
import { CalendarClock, Check, ClipboardList, Phone, X } from 'lucide-react'
import { api } from '../api'
import { EmptyState, ErrorState, LoadingState } from '../components/PageState'
import { formatDateTime, titleCase } from '../format'

export default function ReceptionRequestsPage() {
  const [state, setState] = useState({ loading: true, requests: [], error: null })
  const [busyId, setBusyId] = useState('')
  const [actionError, setActionError] = useState('')
  const load = useCallback(() => {
    setState((current) => ({ ...current, loading: true, error: null }))
    api.getReceptionRequests()
      .then((data) => setState({ loading: false, requests: data.appointmentRequests || [], error: null }))
      .catch((error) => setState({ loading: false, requests: [], error }))
  }, [])
  useEffect(load, [load])

  async function updateRequest(id, action) {
    setBusyId(id)
    setActionError('')
    try {
      await api.updateReceptionRequest(id, { action })
      await load()
    } catch (error) {
      setActionError(error.message || 'The request could not be updated.')
    } finally {
      setBusyId('')
    }
  }

  if (state.loading && !state.requests.length) return <LoadingState label="Loading booking requests…" />
  if (state.error) return <ErrorState error={state.error} onRetry={load} />

  return <>
    <div className="mb-8">
      <p className="text-xs font-extrabold uppercase tracking-[.18em] text-brand/60">Appointments</p>
      <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Booking requests</h1>
      <p className="mt-2 text-sm text-ink/50">Confirm an open slot or decline a request after contacting the patient.</p>
    </div>
    {actionError && <p className="mb-5 rounded-2xl bg-[#fff0e7] p-4 text-sm text-[#914b22]" role="alert">{actionError}</p>}
    {!state.requests.length ? (
      <EmptyState icon={ClipboardList} title="No booking requests" message="New patient requests will appear here." />
    ) : (
      <div className="space-y-4">
        {state.requests.map((request) => (
          <article className="rounded-3xl bg-white p-5 soft-shadow sm:p-6" key={request.id}>
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-extrabold">{request.patient.displayName}</h2>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase ${request.status === 'requested' ? 'bg-mint text-brand' : 'bg-cream text-ink/50'}`}>{titleCase(request.status)}</span>
                </div>
                <p className="mt-1 text-xs font-bold text-ink/40">{request.patient.patientNumber}</p>
                <div className="mt-4 grid gap-2 text-sm text-ink/55 sm:grid-cols-2">
                  <p className="flex items-center gap-2"><CalendarClock className="text-brand" size={16} />{formatDateTime(request.requestedStartAt || request.preferredDate)}</p>
                  <p className="flex items-center gap-2"><Phone className="text-brand" size={16} />{request.patient.phone}</p>
                  <p><span className="font-bold text-ink">Service:</span> {request.serviceName}</p>
                  <p><span className="font-bold text-ink">Dentist:</span> {request.dentistName || 'Any available dentist'}</p>
                </div>
                {request.patientNote && <p className="mt-4 rounded-2xl bg-cream/70 p-3 text-sm leading-6 text-ink/60"><span className="font-bold">Patient note:</span> {request.patientNote}</p>}
              </div>
              {request.status === 'requested' && (
                <div className="flex shrink-0 gap-2">
                  <button className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-xs font-extrabold text-white hover:bg-brand-dark disabled:opacity-50" disabled={busyId === request.id} onClick={() => updateRequest(request.id, 'confirm')}>
                    <Check size={15} /> Confirm
                  </button>
                  <button className="inline-flex items-center gap-2 rounded-xl border border-ink/10 px-4 py-2.5 text-xs font-extrabold text-ink/55 hover:bg-[#fff0e7] disabled:opacity-50" disabled={busyId === request.id} onClick={() => updateRequest(request.id, 'decline')}>
                    <X size={15} /> Decline
                  </button>
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
    )}
  </>
}
