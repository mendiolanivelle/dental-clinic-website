import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowDownRight, ArrowUpRight, CalendarCheck2, Maximize2, Minus, ReceiptText, TrendingUp, UsersRound } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { ErrorState, LoadingState } from '../components/PageState'
import { formatCurrency, formatDate, titleCase } from '../format'

const modes = {
  overview: ['Business overview', 'See clinic performance and what needs attention.'],
  sales: ['Sales & collections', 'Keep billed services, collected cash, and balances clearly separated.'],
  services: ['Service analytics', 'Understand completed-service demand and billed value.'],
  comparisons: ['Performance comparisons', 'Compare equal reporting periods without misleading partial-period totals.'],
  doctors: ['Doctor activity', 'Review workload and business activity without scoring clinical quality.'],
  meeting: ['Clinic performance meeting', 'A privacy-safe view with no patient identifiers or clinical information.'],
}

const moneyKeys = new Set(['grossBilledCents', 'discountsCents', 'netBilledCents', 'cashCollectedCents', 'outstandingCents', 'averageBilledCents'])
const rateKeys = new Set(['collectionRate', 'cancellationRate', 'noShowRate'])

const labels = {
  grossBilledCents: 'Gross billed', discountsCents: 'Discounts', netBilledCents: 'Net billed',
  cashCollectedCents: 'Cash collected', outstandingCents: 'Outstanding balance',
  completedVisits: 'Completed visits', averageBilledCents: 'Average billed visit',
  collectionRate: 'Collection rate', cancellationRate: 'Cancellation rate', noShowRate: 'No-show rate',
  newPatientProfiles: 'New patient profiles', scheduledFutureVisits: 'Future scheduled visits',
}

const formatMetric = (key, value) => {
  if (value === null || value === undefined) return '—'
  if (moneyKeys.has(key)) return formatCurrency(value)
  if (rateKeys.has(key)) return `${(value * 100).toFixed(1)}%`
  return new Intl.NumberFormat('en-PH').format(value)
}

function Delta({ metricKey, current, comparison, available }) {
  if (!available || current === null || comparison === null) return <span className="text-[11px] font-bold text-ink/35">Not enough history</span>
  if (comparison === 0) return <span className="text-[11px] font-bold text-brand">{current === 0 ? 'No change' : 'New'}</span>
  const percentage = ((current - comparison) / comparison) * 100
  const undesirable = ['discountsCents', 'outstandingCents', 'cancellationRate', 'noShowRate'].includes(metricKey)
  const positive = percentage > 0
  const good = undesirable ? !positive : positive
  const Icon = percentage === 0 ? Minus : positive ? ArrowUpRight : ArrowDownRight
  return <span className={`inline-flex items-center gap-1 text-[11px] font-extrabold ${percentage === 0 ? 'text-ink/40' : good ? 'text-brand' : 'text-[#a45728]'}`}><Icon size={13} />{Math.abs(percentage).toFixed(1)}% vs comparison</span>
}

function Filters({ searchParams, setSearchParams, doctors, services }) {
  const [draft, setDraft] = useState({
    from: searchParams.get('from') || '',
    to: searchParams.get('to') || '',
    compare: searchParams.get('compare') || 'previous_period',
    dentistId: searchParams.get('dentistId') || '',
    serviceId: searchParams.get('serviceId') || '',
  })
  return <form className="admin-chrome mb-7 grid gap-3 rounded-3xl bg-white p-4 soft-shadow sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1.2fr_1fr_1fr_auto] xl:items-end" onSubmit={(event) => { event.preventDefault(); const next = new URLSearchParams(); Object.entries(draft).forEach(([key, value]) => value && next.set(key, value)); setSearchParams(next) }}>
    <label className="text-xs font-extrabold text-ink/55">From<input className="mt-2 w-full rounded-xl border border-ink/10 px-3 py-2.5 text-sm" type="date" value={draft.from} onChange={(event) => setDraft({ ...draft, from: event.target.value })} /></label>
    <label className="text-xs font-extrabold text-ink/55">To<input className="mt-2 w-full rounded-xl border border-ink/10 px-3 py-2.5 text-sm" type="date" value={draft.to} onChange={(event) => setDraft({ ...draft, to: event.target.value })} /></label>
    <label className="text-xs font-extrabold text-ink/55">Compare<select className="mt-2 w-full rounded-xl border border-ink/10 bg-white px-3 py-2.5 text-sm" value={draft.compare} onChange={(event) => setDraft({ ...draft, compare: event.target.value })}><option value="previous_period">Previous equal period</option><option value="previous_month">Previous month</option><option value="year_over_year">Same period last year</option><option value="none">No comparison</option></select></label>
    <label className="text-xs font-extrabold text-ink/55">Doctor<select className="mt-2 w-full rounded-xl border border-ink/10 bg-white px-3 py-2.5 text-sm" value={draft.dentistId} onChange={(event) => setDraft({ ...draft, dentistId: event.target.value })}><option value="">All doctors</option>{doctors.map((doctor) => <option value={doctor.id} key={doctor.id}>{doctor.displayName}</option>)}</select></label>
    <label className="text-xs font-extrabold text-ink/55">Service<select className="mt-2 w-full rounded-xl border border-ink/10 bg-white px-3 py-2.5 text-sm" value={draft.serviceId} onChange={(event) => setDraft({ ...draft, serviceId: event.target.value })}><option value="">All services</option>{services.map((service) => <option value={service.id} key={service.id}>{service.name}</option>)}</select></label>
    <button className="rounded-xl bg-brand px-5 py-2.5 text-sm font-extrabold text-white" type="submit">Apply</button>
  </form>
}

function KpiGrid({ data, keys }) {
  return <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Key performance indicators">
    {keys.map((key) => <article className="rounded-3xl bg-white p-5 soft-shadow" key={key}><p className="text-xs font-extrabold uppercase tracking-wide text-ink/40">{labels[key]}</p><p className="mt-3 text-2xl font-extrabold">{formatMetric(key, data.metrics[key])}</p>{key === 'outstandingCents' ? <span className="text-[11px] font-bold text-ink/35">Current point-in-time balance</span> : <Delta metricKey={key} current={data.metrics[key]} comparison={data.comparisonMetrics?.[key]} available={data.comparisonAvailable} />}</article>)}
  </section>
}

function Trend({ data }) {
  const max = Math.max(1, ...data.trend.map((item) => Math.max(item.netBilledCents, item.cashCollectedCents)))
  return <section className="mt-7 rounded-3xl bg-white p-5 soft-shadow sm:p-6"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-extrabold uppercase tracking-wide text-brand/60">Daily trend</p><h2 className="mt-1 text-xl font-extrabold">Billed versus collected</h2></div><div className="flex gap-4 text-[11px] font-bold text-ink/50"><span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-brand" />Net billed</span><span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-[#d99a52]" />Cash collected</span></div></div><div className="mt-5 space-y-3">{data.trend.map((item) => <div className="grid grid-cols-[75px_1fr_88px] items-center gap-3 text-xs" key={item.date}><span className="font-bold text-ink/45">{formatDate(item.date, { month: 'short', day: 'numeric', year: undefined })}</span><div className="space-y-1"><div className="h-2 rounded-full bg-mint"><div className="h-2 rounded-full bg-brand" style={{ width: `${item.netBilledCents / max * 100}%` }} /></div><div className="h-2 rounded-full bg-[#f4dfc9]"><div className="h-2 rounded-full bg-[#d99a52]" style={{ width: `${item.cashCollectedCents / max * 100}%` }} /></div></div><span className="text-right font-extrabold">{item.completedVisits} visits</span></div>)}</div></section>
}

function Services({ services }) {
  const max = Math.max(1, ...services.map((service) => service.completedVisits))
  return <section className="rounded-3xl bg-white p-5 soft-shadow sm:p-6"><h2 className="text-xl font-extrabold">Completed services</h2><p className="mt-1 text-xs text-ink/45">Ranked by completed visits, not requests or free-text descriptions.</p><div className="mt-5 space-y-4">{services.map((service) => <div key={service.id}><div className="flex justify-between gap-4 text-sm"><span className="font-extrabold">{service.name}</span><span className="text-right font-bold text-ink/55">{service.completedVisits} · {formatCurrency(service.netBilledCents)}</span></div><div className="mt-2 h-2 rounded-full bg-mint"><div className="h-2 rounded-full bg-brand" style={{ width: `${service.completedVisits / max * 100}%` }} /></div><p className="mt-1 text-[11px] text-ink/40">{(service.serviceMix * 100).toFixed(1)}% of completed visits · Average {formatMetric('averageBilledCents', service.averageBilledCents)}</p></div>)}</div></section>
}

function Doctors({ doctors }) {
  return <section className="overflow-hidden rounded-3xl bg-white soft-shadow"><div className="p-5 sm:p-6"><h2 className="text-xl font-extrabold">Doctor activity</h2><p className="mt-1 text-xs text-ink/45">Workload and business activity only—not clinical quality.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-mint/55 text-xs uppercase text-brand/65"><tr><th className="px-5 py-3">Doctor</th><th className="px-4 py-3">Completed</th><th className="px-4 py-3">Upcoming</th><th className="px-4 py-3">Cancelled</th><th className="px-4 py-3">No-show</th><th className="px-5 py-3">Net billed</th></tr></thead><tbody>{doctors.map((doctor) => <tr className="border-t border-ink/5" key={doctor.id}><td className="px-5 py-4"><strong>{doctor.displayName}</strong><span className="block text-xs text-ink/40">{doctor.specialty || 'General dentistry'} · {doctor.active ? 'Active' : 'Inactive'}</span></td><td className="px-4 py-4 font-bold">{doctor.completedVisits}</td><td className="px-4 py-4">{doctor.upcomingVisits}</td><td className="px-4 py-4">{doctor.cancelledVisits}</td><td className="px-4 py-4">{doctor.noShowVisits}</td><td className="px-5 py-4 font-extrabold">{formatCurrency(doctor.netBilledCents)}</td></tr>)}</tbody></table></div></section>
}

export default function AdminAnalyticsPage({ mode }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [state, setState] = useState({ loading: true, data: null, error: null })
  const query = searchParams.toString()
  const load = useCallback(() => {
    setState((current) => ({ ...current, loading: true, error: null }))
    api.getAdminAnalytics(mode, query).then((data) => setState({ loading: false, data, error: null })).catch((error) => setState({ loading: false, data: null, error }))
  }, [mode, query])
  useEffect(load, [load])
  const [title, description] = modes[mode]
  const keySets = useMemo(() => mode === 'sales'
    ? ['grossBilledCents', 'discountsCents', 'netBilledCents', 'cashCollectedCents', 'outstandingCents', 'collectionRate', 'averageBilledCents']
    : ['cashCollectedCents', 'netBilledCents', 'outstandingCents', 'completedVisits', 'averageBilledCents', 'newPatientProfiles', 'scheduledFutureVisits', 'cancellationRate'], [mode])

  if (state.loading && !state.data) return <LoadingState label="Preparing clinic analytics…" />
  if (state.error) return <ErrorState error={state.error} onRetry={load} />
  const data = state.data
  const meeting = mode === 'meeting'

  return <div className={meeting ? 'meeting-view' : ''}>
    <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-extrabold uppercase tracking-[.18em] text-brand/60">{meeting ? 'Privacy-safe presentation' : 'Super admin'}</p><h1 className="mt-2 text-3xl font-extrabold tracking-tight">{title}</h1><p className="mt-2 text-sm text-ink/50">{description}</p></div>{meeting && <button className="admin-chrome inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-extrabold text-white" onClick={() => document.documentElement.requestFullscreen?.()}><Maximize2 size={16} /> Fullscreen</button>}</div>
    <Filters searchParams={searchParams} setSearchParams={setSearchParams} doctors={data.doctors} services={data.services} />
    <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl bg-mint/60 px-4 py-3 text-xs font-bold text-brand"><CalendarCheck2 size={16} /> {formatDate(data.period.from)} – {formatDate(data.period.to)}{data.period.inProgress ? ' · Period in progress' : ''}<span className="ml-auto text-ink/40">Updated {new Date(data.period.refreshedAt).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' })}</span></div>
    {meeting && <p className="mb-5 rounded-2xl bg-white p-4 text-xs font-bold text-ink/50 soft-shadow">This meeting view contains aggregate clinic information only. Patient identities and clinical records are excluded.</p>}
    <KpiGrid data={data} keys={keySets} />
    {mode === 'overview' && <section className="mt-7 grid gap-3 sm:grid-cols-3" aria-label="Items needing attention"><div className="rounded-2xl bg-[#fff4e9] p-4 text-sm"><strong className="text-[#985922]">Outstanding balance</strong><p className="mt-1 text-ink/55">Review {formatCurrency(data.metrics.outstandingCents)} in open balances.</p></div><div className="rounded-2xl bg-white p-4 text-sm soft-shadow"><strong>Comparison readiness</strong><p className="mt-1 text-ink/55">{data.comparisonAvailable ? 'Comparable history is available.' : 'Not enough history for this comparison yet.'}</p></div><div className="rounded-2xl bg-mint p-4 text-sm"><strong className="text-brand">Upcoming workload</strong><p className="mt-1 text-ink/55">{data.metrics.scheduledFutureVisits} future visits are scheduled.</p></div></section>}
    {mode !== 'services' && mode !== 'doctors' && <Trend data={data} />}
    {mode === 'sales' && <div className="mt-7 grid gap-5 lg:grid-cols-2"><section className="rounded-3xl bg-white p-5 soft-shadow"><h2 className="text-xl font-extrabold">Payment methods</h2><div className="mt-4 space-y-3">{data.paymentMethods.map((item) => <div className="flex justify-between text-sm" key={item.method}><span className="font-bold text-ink/55">{titleCase(item.method)}</span><strong>{formatCurrency(item.amountCents)}</strong></div>)}</div></section><section className="rounded-3xl bg-white p-5 soft-shadow"><h2 className="text-xl font-extrabold">Outstanding aging</h2><div className="mt-4 grid grid-cols-2 gap-3">{Object.entries(data.aging).map(([key, value]) => <div className="rounded-2xl bg-cream p-3" key={key}><p className="text-xs font-bold text-ink/45">{titleCase(key.replace('Cents', ''))}</p><p className="mt-1 font-extrabold">{formatCurrency(value)}</p></div>)}</div></section></div>}
    <div className={`mt-7 grid gap-7 ${mode === 'overview' || meeting ? 'xl:grid-cols-2' : ''}`}>
      {(mode === 'overview' || mode === 'services' || meeting) && <Services services={data.services} />}
      {(mode === 'overview' || mode === 'doctors' || meeting) && <Doctors doctors={data.doctors} />}
    </div>
    {mode === 'comparisons' && <section className="mt-7 overflow-hidden rounded-3xl bg-white soft-shadow"><div className="p-5"><h2 className="text-xl font-extrabold">Side-by-side totals</h2><p className="mt-1 text-xs text-ink/45">{data.comparisonAvailable ? `${formatDate(data.period.comparison.from)} – ${formatDate(data.period.comparison.to)}` : 'Not enough comparison history yet.'}</p></div><div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-mint/50"><tr><th className="px-5 py-3">Metric</th><th className="px-5 py-3">Current</th><th className="px-5 py-3">Comparison</th><th className="px-5 py-3">Change</th></tr></thead><tbody>{keySets.map((key) => <tr className="border-t border-ink/5" key={key}><td className="px-5 py-4 font-bold">{labels[key]}</td><td className="px-5 py-4 font-extrabold">{formatMetric(key, data.metrics[key])}</td><td className="px-5 py-4">{data.comparisonAvailable ? formatMetric(key, data.comparisonMetrics[key]) : '—'}</td><td className="px-5 py-4"><Delta metricKey={key} current={data.metrics[key]} comparison={data.comparisonMetrics?.[key]} available={data.comparisonAvailable} /></td></tr>)}</tbody></table></div></section>}
    {meeting && <section className="mt-7 grid gap-4 sm:grid-cols-3"><article className="rounded-3xl bg-brand p-5 text-white"><TrendingUp size={20} /><h2 className="mt-4 font-extrabold">Wins</h2><p className="mt-2 text-sm text-white/75">{data.metrics.completedVisits} completed visits and {formatCurrency(data.metrics.cashCollectedCents)} collected.</p></article><article className="rounded-3xl bg-[#fff4e9] p-5"><ReceiptText className="text-[#985922]" size={20} /><h2 className="mt-4 font-extrabold">Needs attention</h2><p className="mt-2 text-sm text-ink/55">{formatCurrency(data.metrics.outstandingCents)} remains outstanding.</p></article><article className="rounded-3xl bg-mint p-5"><UsersRound className="text-brand" size={20} /><h2 className="mt-4 font-extrabold">Next discussion</h2><p className="mt-2 text-sm text-ink/55">Review service demand and upcoming doctor workload.</p></article></section>}
  </div>
}
