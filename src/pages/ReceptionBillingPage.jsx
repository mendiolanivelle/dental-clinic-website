import { useCallback, useEffect, useState } from 'react'
import { Banknote, CheckCircle2, CreditCard, ReceiptText, RotateCcw, X } from 'lucide-react'
import { api } from '../api'
import { EmptyState, ErrorState, LoadingState } from '../components/PageState'
import { formatCurrency, formatDate, formatTime, isInManilaPaymentPeriod, titleCase } from '../format'

const methods = ['cash', 'gcash', 'maya', 'card', 'bank_transfer', 'other']
const toCents = (value) => Math.round(Number(value || 0) * 100)
const recordLabel = (number) => `PAY-${String(number).padStart(6, '0')}`

function PaymentFields({ method, setMethod, reference, setReference }) {
  return <div className="grid gap-4 sm:grid-cols-2">
    <label className="text-sm font-extrabold">Payment method
      <select className="mt-2 w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 font-semibold" value={method} onChange={(event) => setMethod(event.target.value)}>
        {methods.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}
      </select>
    </label>
    <label className="text-sm font-extrabold">Transaction reference <span className="font-normal text-ink/40">(optional)</span>
      <input className="mt-2 w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 font-semibold" maxLength="120" value={reference} onChange={(event) => setReference(event.target.value)} placeholder="GCash, Maya, card or bank ref" />
    </label>
  </div>
}

export default function ReceptionBillingPage() {
  const [state, setState] = useState({ loading: true, data: null, error: null })
  const [checkout, setCheckout] = useState(null)
  const [description, setDescription] = useState('')
  const [subtotal, setSubtotal] = useState('')
  const [method, setMethod] = useState('cash')
  const [reference, setReference] = useState('')
  const [paymentConfirmed, setPaymentConfirmed] = useState(false)
  const [payingCharge, setPayingCharge] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [formError, setFormError] = useState('')
  const [ledgerPeriod, setLedgerPeriod] = useState('today')
  const [selectedChargeId, setSelectedChargeId] = useState(null)

  const load = useCallback(() => {
    setState((current) => ({ ...current, loading: true, error: null }))
    api.getReceptionBilling()
      .then((data) => setState({ loading: false, data, error: null }))
      .catch((error) => setState({ loading: false, data: null, error }))
  }, [])
  useEffect(load, [load])
  useEffect(() => {
    if (!selectedChargeId) return undefined
    const closeOnEscape = (event) => event.key === 'Escape' && setSelectedChargeId(null)
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [selectedChargeId])

  const startCheckout = (appointment) => {
    setCheckout(appointment)
    setDescription(appointment.typeName)
    setSubtotal(appointment.proposedFeeCents ? (appointment.proposedFeeCents / 100).toFixed(2) : '')
    setMethod('cash')
    setReference('')
    setPaymentConfirmed(false)
    setFormError('')
    setMessage('')
  }

  const submitCheckout = async (event) => {
    event.preventDefault()
    const subtotalCents = toCents(subtotal)
    if (!description.trim() || subtotalCents <= 0) {
      setFormError('Enter the service performed and service charge.')
      return
    }
    setBusy(true)
    setFormError('')
    try {
      await api.checkoutAppointment(checkout.id, {
        description: description.trim(),
        subtotalCents,
        paymentMethod: method,
        paymentReference: reference.trim(),
        paymentConfirmed,
      })
      setCheckout(null)
      setMessage('Checkout recorded. The patient ledger is now up to date.')
      load()
    } catch (error) {
      setFormError(error.message || 'Checkout could not be recorded.')
    } finally {
      setBusy(false)
    }
  }

  const submitPayment = async (event, charge) => {
    event.preventDefault()
    setBusy(true)
    setFormError('')
    try {
      await api.addPatientPayment(charge.id, { amountCents: charge.balanceCents, method, reference: reference.trim() })
      setPayingCharge(null)
      setMessage('Payment recorded successfully.')
      load()
    } catch (error) {
      setFormError(error.message || 'The payment could not be recorded.')
    } finally {
      setBusy(false)
    }
  }

  const voidPayment = async (payment) => {
    const reason = window.prompt('Why is this payment being voided?')?.trim()
    if (!reason) return
    setBusy(true)
    setFormError('')
    try {
      await api.voidPatientPayment(payment.id, reason)
      setMessage('The payment was voided and the balance was recalculated.')
      load()
    } catch (error) {
      setFormError(error.message || 'The payment could not be voided.')
    } finally {
      setBusy(false)
    }
  }

  if (state.loading && !state.data) return <LoadingState label="Loading patient billing…" />
  if (state.error) return <ErrorState error={state.error} onRetry={load} />

  const awaiting = state.data?.awaitingCheckout || []
  const charges = state.data?.charges || []
  const selectedCharge = charges.find(({ id }) => id === selectedChargeId)
  const outstandingCharges = charges.filter(({ balanceCents }) => balanceCents > 0)
  const todayPayments = state.data?.todayPayments || []
  const todayTotal = todayPayments.reduce((sum, item) => sum + item.totalCents, 0)
  const periodPayments = charges.flatMap((charge) => charge.payments
    .filter((payment) => isInManilaPaymentPeriod(payment.receivedAt, ledgerPeriod))
    .map((payment) => ({ ...payment, charge })))
  const periodTotal = periodPayments
    .filter(({ status }) => status === 'posted')
    .reduce((sum, payment) => sum + payment.amountCents, 0)
  const subtotalCents = toCents(subtotal)
  const canCompleteCheckout = Boolean(checkout && description.trim() && subtotalCents > 0 && paymentConfirmed)

  return <>
    <div className="mb-8">
      <p className="text-xs font-extrabold uppercase tracking-[.18em] text-brand/60">Patient accounts</p>
      <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Billing & payments</h1>
      <p className="mt-2 text-sm text-ink/50">Complete a visit, record payment, and track patient balances without storing card details.</p>
    </div>

    {message && <p className="mb-5 rounded-2xl bg-mint p-4 text-sm font-bold text-brand" role="status">{message}</p>}
    {formError && <p className="mb-5 rounded-2xl bg-[#fff0e7] p-4 text-sm text-[#914b22]" role="alert">{formError}</p>}

    <section className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Today's collections">
      <div className="rounded-3xl bg-brand p-5 text-white soft-shadow">
        <Banknote size={21} />
        <p className="mt-4 text-xs font-bold text-white/65">Collected today</p>
        <p className="mt-1 text-2xl font-extrabold">{formatCurrency(todayTotal)}</p>
      </div>
      {todayPayments.slice(0, 3).map((item) => <div className="rounded-3xl bg-white p-5 soft-shadow" key={item.method}>
        <CreditCard className="text-brand" size={21} />
        <p className="mt-4 text-xs font-bold text-ink/45">{titleCase(item.method)}</p>
        <p className="mt-1 text-xl font-extrabold">{formatCurrency(item.totalCents)}</p>
      </div>)}
    </section>

    <section className="mb-10" aria-labelledby="checkout-heading">
      <h2 id="checkout-heading" className="text-xl font-extrabold">Today's visits awaiting checkout</h2>
      <p className="mt-1 text-sm text-ink/45">Only visits marked done by the dentist appear here. Reception can edit the suggested fee before payment.</p>
      {checkout && <form className="mt-5 rounded-3xl border border-brand/15 bg-mint/55 p-5 sm:p-6" onSubmit={submitCheckout}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="text-xs font-extrabold uppercase text-brand/60">Checkout patient</p><h3 className="mt-1 text-lg font-extrabold">{checkout.patient.displayName}</h3></div>
          <button className="text-xs font-extrabold text-ink/50" type="button" onClick={() => setCheckout(null)}>Cancel</button>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-extrabold sm:col-span-2">Service performed
            <input className="mt-2 w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 font-semibold" maxLength="240" required value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
          <label className="text-sm font-extrabold">Service charge <span className="font-normal text-ink/40">(editable)</span>
            <input className="mt-2 w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 font-semibold" type="number" min="0.01" step="0.01" required value={subtotal} onChange={(event) => setSubtotal(event.target.value)} placeholder="0.00" />
          </label>
        </div>
        <div className="mt-4"><PaymentFields method={method} setMethod={setMethod} reference={reference} setReference={setReference} /></div>
        <label className="mt-4 flex items-start gap-3 rounded-2xl bg-white p-4 text-sm font-extrabold">
          <input className="mt-0.5 h-5 w-5 accent-brand" type="checkbox" checked={paymentConfirmed} onChange={(event) => setPaymentConfirmed(event.target.checked)} />
          <span>Full service charge has been received</span>
        </label>
        <button className="mt-5 rounded-2xl bg-brand px-5 py-3 text-sm font-extrabold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-40" disabled={busy || !canCompleteCheckout} type="submit">{busy ? 'Recording…' : 'Complete checkout'}</button>
      </form>}
      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        {awaiting.map((appointment) => <article className="rounded-3xl bg-white p-5 soft-shadow" key={appointment.id}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1"><h3 className="font-extrabold">{appointment.patient.displayName}</h3><p className="mt-1 text-sm text-ink/50">{appointment.typeName} · {appointment.dentistName}</p><p className="mt-2 text-xs font-bold text-ink/40">{formatDate(appointment.startsAt)} at {formatTime(appointment.startsAt)} · {appointment.patient.patientNumber}</p><p className="mt-2 text-xs font-extrabold text-brand">Dentist suggested {formatCurrency(appointment.proposedFeeCents)}</p></div>
            <button className="rounded-xl bg-brand px-4 py-2.5 text-xs font-extrabold text-white hover:bg-brand-dark" type="button" onClick={() => startCheckout(appointment)}>Check out</button>
          </div>
        </article>)}
      </div>
      {!awaiting.length && <div className="mt-5"><EmptyState icon={CheckCircle2} title="No visits awaiting checkout today" message="A visit appears here after its dentist marks it done." /></div>}
    </section>

    <section className="mb-10" aria-labelledby="payment-ledger-heading">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="payment-ledger-heading" className="text-xl font-extrabold">{ledgerPeriod === 'today' ? "Today's" : "This week's"} payment ledger</h2>
          <p className="mt-1 text-sm text-ink/45">Posted and voided transactions recorded by reception.</p>
        </div>
        <div className="inline-flex w-fit rounded-2xl bg-white p-1 soft-shadow" role="group" aria-label="Payment ledger period">
          {['today', 'week'].map((period) => <button className={`rounded-xl px-4 py-2 text-xs font-extrabold transition ${ledgerPeriod === period ? 'bg-brand text-white' : 'text-ink/50 hover:bg-mint'}`} key={period} type="button" aria-pressed={ledgerPeriod === period} onClick={() => setLedgerPeriod(period)}>{period === 'today' ? 'Today' : 'This week'}</button>)}
        </div>
      </div>
      <div className="mt-5 overflow-hidden rounded-3xl bg-white soft-shadow">
        <div className="flex items-center justify-between gap-4 border-b border-ink/5 bg-mint/45 px-5 py-4 sm:px-6">
          <span className="text-xs font-extrabold uppercase tracking-wide text-brand/65">{periodPayments.length} transaction{periodPayments.length === 1 ? '' : 's'}</span>
          <strong className="text-lg text-brand">{formatCurrency(periodTotal)}</strong>
        </div>
        {!!outstandingCharges.length && <div className="border-b border-ink/5 bg-[#fff8ed] px-5 py-4 sm:px-6">
          <p className="mb-3 text-xs font-extrabold uppercase tracking-wide text-[#9a5d22]">Outstanding balances</p>
          <div className="space-y-2">{outstandingCharges.map((charge) => <button className="flex w-full flex-col gap-2 rounded-2xl bg-white px-4 py-3 text-left transition hover:ring-2 hover:ring-[#d99a52]/20 sm:flex-row sm:items-center" key={`outstanding-${charge.id}`} type="button" onClick={() => { setSelectedChargeId(charge.id); setPayingCharge(null); setFormError('') }}><span className="min-w-0 flex-1"><strong className="block text-sm">{charge.patient.displayName}</strong><span className="text-xs text-ink/45">{charge.description} · {recordLabel(charge.recordNumber)}</span></span><span className="text-sm font-extrabold text-[#9a5d22]">{formatCurrency(charge.balanceCents)} due</span><span className="text-xs font-extrabold text-brand/60">View details</span></button>)}</div>
        </div>}
        {periodPayments.map(({ charge, ...payment }) => <button className={`grid w-full gap-2 border-b border-ink/5 px-5 py-4 text-left text-sm transition last:border-0 hover:bg-mint/35 focus:outline-none focus:ring-4 focus:ring-inset focus:ring-brand/10 sm:grid-cols-[1.3fr_.8fr_1fr_1.2fr_auto] sm:items-center sm:px-6 ${payment.status === 'voided' ? 'text-ink/35' : ''}`} key={payment.id} type="button" onClick={() => { setSelectedChargeId(charge.id); setPayingCharge(null); setFormError('') }}>
          <div><p className="font-extrabold">{charge.patient.displayName}</p><p className="mt-1 text-xs text-ink/45">{charge.description} · {charge.dentistName}</p></div>
          <div className={payment.status === 'voided' ? 'line-through' : ''}><p className="font-extrabold">{formatCurrency(payment.amountCents)}</p><p className="mt-1 text-xs text-ink/45">{titleCase(payment.method)} · {titleCase(payment.status)}</p></div>
          <div className="text-xs text-ink/55">{formatDate(payment.receivedAt)}<br />{formatTime(payment.receivedAt)}</div>
          <div className="text-xs font-bold text-brand/70">Recorded by {payment.recordedBy}</div>
          <span className="text-xs font-extrabold text-brand/60">View details</span>
        </button>)}
        {!periodPayments.length && <div className="p-5 sm:p-6"><EmptyState icon={ReceiptText} title={`No payments ${ledgerPeriod === 'today' ? 'today' : 'this week'}`} message="Newly recorded payments will appear here automatically." /></div>}
      </div>
    </section>

    {selectedCharge && <div className="fixed inset-0 z-50 grid place-items-center bg-ink/45 p-4 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && setSelectedChargeId(null)}>
      <section aria-labelledby="ledger-details-heading" aria-modal="true" className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[30px] bg-white p-5 soft-shadow sm:p-7" role="dialog">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-xs font-extrabold uppercase tracking-[.16em] text-brand/60">{recordLabel(selectedCharge.recordNumber)}</p><h2 className="mt-1 text-2xl font-extrabold" id="ledger-details-heading">{selectedCharge.patient.displayName}</h2></div>
          <button aria-label="Close payment details" className="rounded-xl bg-cream p-2.5 text-ink/55 hover:bg-mint" type="button" onClick={() => { setSelectedChargeId(null); setPayingCharge(null) }}><X size={19} /></button>
        </div>
        <div className="mt-5 rounded-3xl bg-mint/55 p-5">
          <div className="flex flex-wrap items-center gap-2"><h3 className="font-extrabold">{selectedCharge.description}</h3><span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-extrabold uppercase text-ink/55">{titleCase(selectedCharge.status)}</span></div>
          <p className="mt-1 text-sm text-ink/50">{selectedCharge.dentistName} · Checkout handled by {selectedCharge.handledBy}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3"><div><p className="text-xs font-bold text-ink/40">Total</p><p className="mt-1 font-extrabold">{formatCurrency(selectedCharge.totalCents)}</p></div><div><p className="text-xs font-bold text-ink/40">Paid</p><p className="mt-1 font-extrabold">{formatCurrency(selectedCharge.paidCents)}</p></div><div><p className="text-xs font-bold text-ink/40">Balance</p><p className="mt-1 font-extrabold text-brand">{formatCurrency(selectedCharge.balanceCents)}</p></div></div>
        </div>
        {selectedCharge.balanceCents > 0 && payingCharge !== selectedCharge.id && <button className="mt-5 rounded-xl bg-brand px-4 py-2.5 text-xs font-extrabold text-white hover:bg-brand-dark" type="button" onClick={() => { setPayingCharge(selectedCharge.id); setMethod('cash'); setReference(''); setFormError('') }}>Pay full balance</button>}
        {payingCharge === selectedCharge.id && <form className="mt-5 rounded-2xl bg-cream/70 p-4" onSubmit={(event) => submitPayment(event, selectedCharge)}>
          <p className="mb-4 text-sm font-extrabold">Payment total: {formatCurrency(selectedCharge.balanceCents)}</p>
          <PaymentFields method={method} setMethod={setMethod} reference={reference} setReference={setReference} />
          {formError && <p className="mt-3 text-sm text-[#914b22]" role="alert">{formError}</p>}
          <div className="mt-4 flex gap-2"><button className="rounded-xl bg-brand px-4 py-2.5 text-xs font-extrabold text-white disabled:opacity-60" disabled={busy} type="submit">Record payment</button><button className="rounded-xl px-4 py-2.5 text-xs font-extrabold text-ink/50" type="button" onClick={() => setPayingCharge(null)}>Cancel</button></div>
        </form>}
        <div className="mt-6 border-t border-ink/5 pt-5">
          <h3 className="font-extrabold">Payment history</h3>
          {selectedCharge.payments.map((payment) => <div className={`flex flex-col gap-2 border-b border-ink/5 py-3 text-xs last:border-0 sm:flex-row sm:items-center ${payment.status === 'voided' ? 'text-ink/35 line-through' : 'text-ink/55'}`} key={payment.id}>
            <ReceiptText className="shrink-0 text-brand" size={15} /><span className="font-extrabold">{formatCurrency(payment.amountCents)}</span><span>{titleCase(payment.method)}</span><span>{formatDate(payment.receivedAt)} at {formatTime(payment.receivedAt)}</span><span>Recorded by {payment.recordedBy}</span>{payment.reference && <span>Ref: {payment.reference}</span>}<span className="sm:ml-auto">{titleCase(payment.status)}</span>{payment.status === 'posted' && <button aria-label="Void payment" className="inline-flex items-center gap-1 font-extrabold text-[#9a4e22] no-underline" disabled={busy} type="button" onClick={() => voidPayment(payment)}><RotateCcw size={13} /> Void</button>}
          </div>)}
          {!selectedCharge.payments.length && <p className="mt-3 text-sm text-ink/45">No payments have been recorded yet.</p>}
        </div>
      </section>
    </div>}
  </>
}
