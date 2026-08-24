import { useCallback, useEffect, useState } from 'react'
import { Banknote, CheckCircle2, CreditCard, ReceiptText, RotateCcw } from 'lucide-react'
import { api } from '../api'
import { EmptyState, ErrorState, LoadingState } from '../components/PageState'
import { formatCurrency, formatDate, formatTime, titleCase } from '../format'

const methods = ['cash', 'gcash', 'maya', 'card', 'bank_transfer', 'other']
const toCents = (value) => Math.round(Number(value || 0) * 100)
const recordLabel = (number) => `PAY-${String(number).padStart(6, '0')}`

function PaymentFields({ amount, setAmount, method, setMethod, reference, setReference, max }) {
  return <div className="grid gap-4 sm:grid-cols-3">
    <label className="text-sm font-extrabold">Amount received
      <input className="mt-2 w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 font-semibold" type="number" min="0" max={max} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} />
    </label>
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
  const [discount, setDiscount] = useState('0')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('cash')
  const [reference, setReference] = useState('')
  const [invoiceReference, setInvoiceReference] = useState('')
  const [payingCharge, setPayingCharge] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [formError, setFormError] = useState('')

  const load = useCallback(() => {
    setState((current) => ({ ...current, loading: true, error: null }))
    api.getReceptionBilling()
      .then((data) => setState({ loading: false, data, error: null }))
      .catch((error) => setState({ loading: false, data: null, error }))
  }, [])
  useEffect(load, [load])

  const startCheckout = (appointment) => {
    setCheckout(appointment)
    setDescription(appointment.typeName)
    setSubtotal('')
    setDiscount('0')
    setAmount('')
    setMethod('cash')
    setReference('')
    setInvoiceReference('')
    setFormError('')
    setMessage('')
  }

  const submitCheckout = async (event) => {
    event.preventDefault()
    const subtotalCents = toCents(subtotal)
    const discountCents = toCents(discount)
    const paymentAmountCents = toCents(amount)
    if (!description.trim() || subtotalCents <= 0 || discountCents >= subtotalCents || paymentAmountCents > subtotalCents - discountCents) {
      setFormError('Check the service, charge, discount, and amount received.')
      return
    }
    setBusy(true)
    setFormError('')
    try {
      await api.checkoutAppointment(checkout.id, {
        description: description.trim(),
        subtotalCents,
        discountCents,
        paymentAmountCents,
        ...(paymentAmountCents ? { paymentMethod: method } : {}),
        paymentReference: reference.trim(),
        invoiceReference: invoiceReference.trim(),
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
    const amountCents = toCents(amount)
    if (amountCents <= 0 || amountCents > charge.balanceCents) {
      setFormError('Enter an amount within the remaining balance.')
      return
    }
    setBusy(true)
    setFormError('')
    try {
      await api.addPatientPayment(charge.id, { amountCents, method, reference: reference.trim() })
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
  const todayPayments = state.data?.todayPayments || []
  const todayTotal = todayPayments.reduce((sum, item) => sum + item.totalCents, 0)

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
      <h2 id="checkout-heading" className="text-xl font-extrabold">Awaiting checkout</h2>
      <p className="mt-1 text-sm text-ink/45">Confirmed appointments appear here until reception records the final charge.</p>
      {checkout && <form className="mt-5 rounded-3xl border border-brand/15 bg-mint/55 p-5 sm:p-6" onSubmit={submitCheckout}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="text-xs font-extrabold uppercase text-brand/60">Checkout patient</p><h3 className="mt-1 text-lg font-extrabold">{checkout.patient.displayName}</h3></div>
          <button className="text-xs font-extrabold text-ink/50" type="button" onClick={() => setCheckout(null)}>Cancel</button>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <label className="text-sm font-extrabold sm:col-span-2">Service performed
            <input className="mt-2 w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 font-semibold" maxLength="240" required value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
          <label className="text-sm font-extrabold">Service charge
            <input className="mt-2 w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 font-semibold" type="number" min="0.01" step="0.01" required value={subtotal} onChange={(event) => setSubtotal(event.target.value)} placeholder="0.00" />
          </label>
          <label className="text-sm font-extrabold">Discount
            <input className="mt-2 w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 font-semibold" type="number" min="0" step="0.01" value={discount} onChange={(event) => setDiscount(event.target.value)} />
          </label>
        </div>
        <div className="mt-4"><PaymentFields amount={amount} setAmount={setAmount} method={method} setMethod={setMethod} reference={reference} setReference={setReference} max={Math.max(0, Number(subtotal || 0) - Number(discount || 0))} /></div>
        <label className="mt-4 block text-sm font-extrabold">BIR invoice reference <span className="font-normal text-ink/40">(optional)</span>
          <input className="mt-2 w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 font-semibold sm:max-w-sm" maxLength="120" value={invoiceReference} onChange={(event) => setInvoiceReference(event.target.value)} placeholder="Number from the clinic invoice" />
        </label>
        <button className="mt-5 rounded-2xl bg-brand px-5 py-3 text-sm font-extrabold text-white hover:bg-brand-dark disabled:opacity-60" disabled={busy} type="submit">{busy ? 'Recording…' : 'Complete checkout'}</button>
      </form>}
      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        {awaiting.map((appointment) => <article className="rounded-3xl bg-white p-5 soft-shadow" key={appointment.id}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1"><h3 className="font-extrabold">{appointment.patient.displayName}</h3><p className="mt-1 text-sm text-ink/50">{appointment.typeName} · {appointment.dentistName}</p><p className="mt-2 text-xs font-bold text-ink/40">{formatDate(appointment.startsAt)} at {formatTime(appointment.startsAt)} · {appointment.patient.patientNumber}</p></div>
            <button className="rounded-xl bg-brand px-4 py-2.5 text-xs font-extrabold text-white hover:bg-brand-dark" type="button" onClick={() => startCheckout(appointment)}>Check out</button>
          </div>
        </article>)}
      </div>
      {!awaiting.length && <div className="mt-5"><EmptyState icon={CheckCircle2} title="No visits awaiting checkout" message="Confirmed appointments will appear here for reception." /></div>}
    </section>

    <section aria-labelledby="ledger-heading">
      <h2 id="ledger-heading" className="text-xl font-extrabold">Patient payment ledger</h2>
      <div className="mt-5 space-y-4">
        {charges.map((charge) => <article className="rounded-3xl bg-white p-5 soft-shadow sm:p-6" key={charge.id}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><h3 className="font-extrabold">{charge.patient.displayName}</h3><span className="rounded-full bg-cream px-2.5 py-1 text-[10px] font-extrabold uppercase text-ink/55">{titleCase(charge.status)}</span></div>
              <p className="mt-1 text-sm text-ink/50">{charge.description} · {recordLabel(charge.recordNumber)}</p>
              <p className="mt-2 text-xs text-ink/40">Total {formatCurrency(charge.totalCents)} · Paid {formatCurrency(charge.paidCents)} · Balance <strong>{formatCurrency(charge.balanceCents)}</strong>{charge.invoiceReference ? ` · Invoice ${charge.invoiceReference}` : ''}</p>
            </div>
            {charge.balanceCents > 0 && <button className="rounded-xl border border-brand/15 px-4 py-2.5 text-xs font-extrabold text-brand hover:bg-mint" type="button" onClick={() => { setPayingCharge(charge.id); setAmount((charge.balanceCents / 100).toFixed(2)); setMethod('cash'); setReference(''); setFormError('') }}>Add payment</button>}
          </div>
          {payingCharge === charge.id && <form className="mt-5 rounded-2xl bg-cream/70 p-4" onSubmit={(event) => submitPayment(event, charge)}>
            <PaymentFields amount={amount} setAmount={setAmount} method={method} setMethod={setMethod} reference={reference} setReference={setReference} max={charge.balanceCents / 100} />
            <div className="mt-4 flex gap-2"><button className="rounded-xl bg-brand px-4 py-2.5 text-xs font-extrabold text-white disabled:opacity-60" disabled={busy} type="submit">Record payment</button><button className="rounded-xl px-4 py-2.5 text-xs font-extrabold text-ink/50" type="button" onClick={() => setPayingCharge(null)}>Cancel</button></div>
          </form>}
          {!!charge.payments.length && <div className="mt-5 border-t border-ink/5 pt-4">
            {charge.payments.map((payment) => <div className={`flex flex-col gap-2 py-2 text-xs sm:flex-row sm:items-center ${payment.status === 'voided' ? 'text-ink/35 line-through' : 'text-ink/55'}`} key={payment.id}>
              <ReceiptText className="shrink-0 text-brand" size={15} /><span className="font-extrabold">{formatCurrency(payment.amountCents)}</span><span>{titleCase(payment.method)}</span><span>{formatDate(payment.receivedAt)} at {formatTime(payment.receivedAt)}</span>{payment.reference && <span>Ref: {payment.reference}</span>}<span className="sm:ml-auto">{titleCase(payment.status)}</span>{payment.status === 'posted' && <button aria-label="Void payment" className="inline-flex items-center gap-1 font-extrabold text-[#9a4e22] no-underline" disabled={busy} type="button" onClick={() => voidPayment(payment)}><RotateCcw size={13} /> Void</button>}
            </div>)}
          </div>}
        </article>)}
      </div>
      {!charges.length && <EmptyState icon={ReceiptText} title="No payment records yet" message="Completed checkouts and patient balances will appear here." />}
    </section>
  </>
}
