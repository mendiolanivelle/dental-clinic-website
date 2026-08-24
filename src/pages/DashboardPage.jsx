import { useCallback, useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import {
  Activity,
  ArrowRight,
  CalendarDays,
  ChevronRight,
  Clock3,
  FileText,
  Phone,
  Sparkles,
  Stethoscope,
} from 'lucide-react'
import { api } from '../api'
import ClinicPhoneLink, { clinicPhoneDisplay } from '../components/ClinicPhoneLink'
import { ErrorState, LoadingState } from '../components/PageState'
import { formatDate, formatDateTime, titleCase } from '../format'
import {
  appointmentView,
  listFrom,
  planFrom,
  recordView,
  serviceView,
  treatmentPlanView,
} from '../portalData'

function getName(patient) {
  return patient?.displayName || patient?.display_name || patient?.name || 'Patient'
}

function dashboardFrom(payload) {
  return payload?.dashboard || payload?.data || payload || {}
}

export default function DashboardPage() {
  const { patient } = useOutletContext()
  const [dashboard, setDashboard] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setDashboard(dashboardFrom(await api.getDashboard()))
    } catch (requestError) {
      setError(requestError)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (loading) return <LoadingState label="Preparing your care overview…" />
  if (error) return <ErrorState error={error} onRetry={load} />

  const nextAppointment = dashboard?.nextAppointment
    ? appointmentView(dashboard.nextAppointment)
    : dashboard?.next_appointment
      ? appointmentView(dashboard.next_appointment)
      : null
  const plan = treatmentPlanView(
    planFrom(dashboard?.treatmentPlan ?? dashboard?.treatment_plan ?? dashboard?.activeTreatmentPlan ?? null),
  )
  const recentRecords = dashboard?.recentRecords
    ? listFrom({ recentRecords: dashboard.recentRecords }, 'recentRecords')
    : dashboard?.recentRecord
      ? [dashboard.recentRecord]
      : dashboard?.recent_record
        ? [dashboard.recent_record]
        : []
  const recentRecord = recentRecords[0] ? recordView(recentRecords[0]) : null
  const services = listFrom({ services: dashboard?.services }, 'services').map(serviceView)
  const name = getName(patient).split(/\s+/)[0]

  return (
    <>
      <section className="mb-7">
        <p className="mb-1 text-sm font-semibold text-brand">
          {formatDate(new Date(), { weekday: 'long' })}
        </p>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          Welcome back, {name} <span aria-hidden="true">👋</span>
        </h1>
        <p className="mt-2 text-sm text-ink/50">
          Here is your current dental care overview.
        </p>
      </section>

      <section className="soft-shadow relative mb-8 overflow-hidden rounded-[32px] bg-brand px-6 py-8 text-white sm:px-9 sm:py-10">
        <div className="absolute -right-16 -top-24 h-72 w-72 rounded-full border-[42px] border-white/8" />
        <div className="absolute bottom-[-90px] right-[18%] h-48 w-48 rounded-full bg-[#89c8bb]/20" />
        <div className="relative z-10 max-w-xl">
          <span className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/12 px-3 py-1.5 text-xs font-bold">
            <Activity size={14} />
            Your smile, our priority
          </span>
          <h2 className="text-3xl font-extrabold leading-tight sm:text-4xl">
            Simple care updates,
            <br className="hidden sm:block" /> whenever you need them.
          </h2>
          <p className="mt-3 max-w-md text-sm leading-6 text-white/70">
            See your booked visits, published treatment history, and dentist recommendations in one secure place.
          </p>
          <Link className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-extrabold text-brand hover:bg-mint" to="/portal/appointments">
            View appointments
            <ArrowRight size={17} />
          </Link>
        </div>
        <div className="absolute bottom-0 right-6 hidden h-[90%] w-[31%] items-end justify-center xl:flex">
          <div className="relative grid aspect-square w-full max-w-[300px] place-items-center rounded-full bg-[#d7eee8]">
            <div className="grid h-[82%] w-[82%] place-items-center rounded-full border border-white/50 bg-white/20">
              <Stethoscope className="text-brand/70" size={105} strokeWidth={1.2} />
            </div>
          </div>
        </div>
      </section>

      <section className="mb-8 rounded-3xl bg-white p-5 sm:p-6" aria-labelledby="services-heading">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[.18em] text-brand/60">Plan your next visit</p>
            <h2 id="services-heading" className="mt-1 text-xl font-extrabold">Choose a dental service</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-ink/50">
              Select the care you need and request a convenient appointment time. The clinic will confirm availability with you.
            </p>
          </div>
          <Link className="inline-flex shrink-0 items-center gap-1 text-xs font-extrabold text-brand" to="/portal/appointments">
            View booking requests <ChevronRight size={15} />
          </Link>
        </div>

        {services.length ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {services.map((service) => (
              <article className="flex flex-col rounded-2xl border border-ink/6 bg-cream/45 p-4" key={service.id}>
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-mint text-brand">
                  <Sparkles size={18} />
                </div>
                <h3 className="mt-4 text-sm font-extrabold">{service.name}</h3>
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-ink/50">{service.description}</p>
                {service.durationMinutes && (
                  <p className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-bold text-brand/70">
                    <Clock3 size={13} />
                    About {service.durationMinutes} minutes
                  </p>
                )}
                <Link
                  className="mt-4 inline-flex items-center gap-1.5 text-xs font-extrabold text-brand hover:text-brand-dark"
                  to={`/portal/appointments?service=${encodeURIComponent(service.id)}`}
                >
                  Book this service <ArrowRight size={14} />
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <p className="rounded-2xl bg-cream/60 p-5 text-center text-sm text-ink/50">
            The clinic service catalog is being prepared. Please call us if you need help arranging care.
          </p>
        )}
      </section>

      <div className="grid gap-7 xl:grid-cols-[1.35fr_.8fr]">
        <div className="space-y-7">
          <section className="rounded-3xl bg-white p-5 sm:p-6">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[.18em] text-brand/60">Next visit</p>
                <h2 className="mt-1 text-xl font-extrabold">Upcoming appointment</h2>
              </div>
              <Link className="flex shrink-0 items-center gap-1 text-xs font-extrabold text-brand" to="/portal/appointments">
                View all <ChevronRight size={15} />
              </Link>
            </div>

            {nextAppointment ? (
              <article className="flex flex-col gap-4 rounded-2xl border border-ink/6 bg-cream/45 p-4 sm:flex-row sm:items-center">
                <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-brand text-white">
                  <CalendarDays size={25} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-ink/45">
                    <Clock3 size={13} />
                    {formatDateTime(nextAppointment.startsAt)}
                  </div>
                  <h3 className="text-base font-extrabold">{nextAppointment.title}</h3>
                  <p className="mt-1 text-xs text-ink/50">with {nextAppointment.dentistName}</p>
                </div>
                <span className="self-start rounded-full bg-mint px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wide text-brand sm:self-auto">
                  {titleCase(nextAppointment.status)}
                </span>
              </article>
            ) : (
              <div className="rounded-2xl bg-cream/60 p-6 text-center">
                <CalendarDays className="mx-auto text-brand/55" size={25} />
                <p className="mt-3 text-sm font-extrabold">No upcoming appointment</p>
                <p className="mt-1 text-xs leading-5 text-ink/45">Call the clinic if you need help arranging your next visit.</p>
              </div>
            )}
          </section>

          <section className="rounded-3xl bg-white p-5 sm:p-6">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[.18em] text-brand/60">Published by your dentist</p>
                <h2 className="mt-1 text-xl font-extrabold">Recent treatment</h2>
              </div>
              <Link className="flex shrink-0 items-center gap-1 text-xs font-extrabold text-brand" to="/portal/records">
                My records <ChevronRight size={15} />
              </Link>
            </div>
            {recentRecord ? (
              <article className="flex gap-4 rounded-2xl border border-ink/6 p-4">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#e9e7f8] text-[#7061a8]">
                  <FileText size={21} />
                </div>
                <div>
                  <p className="text-xs font-bold text-ink/45">{formatDate(recentRecord.treatedOn)}</p>
                  <h3 className="mt-1 text-sm font-extrabold">{recentRecord.procedureName}</h3>
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-ink/50">
                    {recentRecord.summary || 'Your dentist has published this completed treatment.'}
                  </p>
                </div>
              </article>
            ) : (
              <p className="rounded-2xl bg-cream/60 p-5 text-center text-sm text-ink/50">
                No treatment summaries have been published yet.
              </p>
            )}
          </section>
        </div>

        <aside className="space-y-5">
          <section className="rounded-3xl bg-white p-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[.18em] text-brand/60">Care plan</p>
                <h2 className="mt-1 text-lg font-extrabold">Current treatment</h2>
              </div>
              <div className="grid h-10 w-10 place-items-center rounded-2xl bg-mint text-brand">
                <Sparkles size={19} />
              </div>
            </div>
            {plan ? (
              <>
                <p className="text-sm font-extrabold">{plan.title}</p>
                <p className="mt-2 line-clamp-3 text-xs leading-5 text-ink/50">{plan.summary}</p>
                <div className="mt-4 rounded-2xl bg-cream p-3">
                  <p className="text-[10px] font-bold text-ink/40">Next recommended care</p>
                  <p className="mt-1 text-xs font-extrabold">{formatDate(plan.nextRecommendedOn)}</p>
                  <p className="mt-1 text-[10px] text-ink/40">This is a recommendation, not a booking.</p>
                </div>
                <Link className="mt-4 inline-flex items-center gap-1 text-xs font-extrabold text-brand" to="/portal/treatment-plan">
                  View treatment plan <ChevronRight size={14} />
                </Link>
              </>
            ) : (
              <p className="text-xs leading-5 text-ink/50">No active treatment plan has been published.</p>
            )}
          </section>

          <section className="rounded-3xl bg-[#f4dfc9] p-6">
            <div className="mb-4 grid h-10 w-10 place-items-center rounded-2xl bg-white/70 text-[#a65c26]">
              <Phone size={18} />
            </div>
            <h2 className="text-lg font-extrabold">Need clinic assistance?</h2>
            <p className="mt-2 text-xs leading-5 text-ink/55">
              Call our care team for urgent concerns or help with rescheduling.
            </p>
            <ClinicPhoneLink className="mt-5 inline-flex items-center gap-2 text-sm font-extrabold text-[#915020]">
              <Phone size={15} />
              {clinicPhoneDisplay}
            </ClinicPhoneLink>
          </section>
        </aside>
      </div>
    </>
  )
}
