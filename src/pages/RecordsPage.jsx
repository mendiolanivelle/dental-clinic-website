import { useCallback, useEffect, useState } from 'react'
import { CalendarDays, FileCheck2, FileText, ShieldCheck, Stethoscope } from 'lucide-react'
import { api } from '../api'
import { EmptyState, ErrorState, LoadingState } from '../components/PageState'
import { formatDate } from '../format'
import { listFrom, recordView } from '../portalData'

export default function RecordsPage() {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setRecords(listFrom(await api.getRecords(), 'records'))
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
        <p className="text-xs font-extrabold uppercase tracking-[.18em] text-brand/60">Published care history</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">My records</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-ink/50">
          Patient-friendly summaries that your dental team has reviewed and published for you.
        </p>
      </section>

      <div className="mb-6 flex gap-3 rounded-2xl border border-brand/10 bg-mint/60 p-4">
        <ShieldCheck className="mt-0.5 shrink-0 text-brand" size={19} />
        <p className="text-xs leading-5 text-ink/60">
          This page does not include internal clinical notes, raw diagnosis codes, or attachments. Contact the clinic if you need a complete official copy.
        </p>
      </div>

      {loading ? (
        <LoadingState label="Loading your published records…" />
      ) : error ? (
        <ErrorState error={error} onRetry={load} />
      ) : records.length ? (
        <section className="grid gap-5 xl:grid-cols-2" aria-label="Published treatment records">
          {records.map((value) => {
            const record = recordView(value)
            return (
              <article key={record.id} className="rounded-3xl bg-white p-5 soft-shadow sm:p-6">
                <div className="flex items-start gap-4">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-mint text-brand">
                    <FileCheck2 size={22} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-brand/60">Completed treatment</p>
                    <h2 className="mt-1 text-lg font-extrabold">{record.procedureName}</h2>
                  </div>
                </div>

                <dl className="mt-5 grid gap-3 rounded-2xl bg-cream/65 p-4 sm:grid-cols-2">
                  <div>
                    <dt className="flex items-center gap-1.5 text-[10px] font-bold text-ink/40">
                      <CalendarDays size={13} />
                      Treatment date
                    </dt>
                    <dd className="mt-1 text-xs font-extrabold">{formatDate(record.treatedOn)}</dd>
                  </div>
                  <div>
                    <dt className="flex items-center gap-1.5 text-[10px] font-bold text-ink/40">
                      <Stethoscope size={13} />
                      Dentist
                    </dt>
                    <dd className="mt-1 text-xs font-extrabold">{record.dentistName}</dd>
                  </div>
                </dl>

                <div className="mt-5">
                  <h3 className="text-xs font-extrabold uppercase tracking-[.14em] text-ink/40">Summary for you</h3>
                  <p className="mt-2 whitespace-pre-line text-sm leading-6 text-ink/65">
                    {record.summary || 'No additional patient summary was provided.'}
                  </p>
                </div>
              </article>
            )
          })}
        </section>
      ) : (
        <EmptyState
          icon={FileText}
          title="No published records yet"
          message="Your dentist-reviewed treatment summaries will appear here after the clinic publishes them."
        />
      )}
    </>
  )
}
