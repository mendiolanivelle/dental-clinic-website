import { useCallback, useEffect, useState } from 'react'
import { CalendarDays, FileCheck2, FileText, ReceiptText, ShieldCheck, Stethoscope } from 'lucide-react'
import { api } from '../api'
import { EmptyState, ErrorState, LoadingState } from '../components/PageState'
import { formatCurrency, formatDate, titleCase } from '../format'
import { listFrom, recordView } from '../portalData'

export default function RecordsPage() {
  const [records, setRecords] = useState([])
  const [charges, setCharges] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [recordData, billingData] = await Promise.all([api.getRecords(), api.getBilling()])
      setRecords(listFrom(recordData, 'records'))
      setCharges(listFrom(billingData, 'charges'))
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

      <section className="mt-10" aria-labelledby="payment-history-heading">
        <p className="text-xs font-extrabold uppercase tracking-[.18em] text-brand/60">Financial history</p>
        <h2 id="payment-history-heading" className="mt-1 text-2xl font-extrabold">Billing & payments</h2>
        <p className="mt-2 text-sm text-ink/50">Payment records issued by the clinic. Contact reception for an official invoice or correction.</p>
        {charges.length ? <div className="mt-5 grid gap-5 xl:grid-cols-2">
          {charges.map((charge) => <article className="rounded-3xl bg-white p-5 soft-shadow sm:p-6" key={charge.id}>
            <div className="flex items-start gap-4">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-mint text-brand"><ReceiptText size={22} /></div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><h3 className="font-extrabold">{charge.description}</h3><span className="rounded-full bg-cream px-2 py-1 text-[10px] font-extrabold uppercase text-ink/55">{titleCase(charge.status)}</span></div>
                <p className="mt-1 text-xs text-ink/45">{charge.dentistName} · Payment record PAY-{String(charge.recordNumber).padStart(6, '0')}</p>
              </div>
            </div>
            <dl className="mt-5 grid grid-cols-3 gap-3 rounded-2xl bg-cream/65 p-4 text-xs">
              <div><dt className="text-ink/40">Total</dt><dd className="mt-1 font-extrabold">{formatCurrency(charge.totalCents)}</dd></div>
              <div><dt className="text-ink/40">Paid</dt><dd className="mt-1 font-extrabold">{formatCurrency(charge.paidCents)}</dd></div>
              <div><dt className="text-ink/40">Balance</dt><dd className="mt-1 font-extrabold">{formatCurrency(charge.balanceCents)}</dd></div>
            </dl>
            {!!charge.payments.length && <div className="mt-4 space-y-2">
              {charge.payments.map((payment) => <div className="flex flex-wrap justify-between gap-2 text-xs text-ink/55" key={payment.id}><span>{formatDate(payment.receivedAt)} · {titleCase(payment.method)}</span><span className="font-extrabold">{formatCurrency(payment.amountCents)}</span></div>)}
            </div>}
            {charge.invoiceReference && <p className="mt-4 text-xs font-bold text-ink/45">Clinic invoice reference: {charge.invoiceReference}</p>}
          </article>)}
        </div> : <div className="mt-5"><EmptyState icon={ReceiptText} title="No payment history yet" message="Charges and recorded payments will appear here after reception completes checkout." /></div>}
      </section>
    </>
  )
}
