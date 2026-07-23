import { useCallback, useEffect, useState } from 'react'
import {
  CalendarCheck2,
  CalendarDays,
  CalendarSearch,
  Clock3,
  Phone,
  Sparkles,
} from 'lucide-react'
import { api } from '../api'
import ClinicPhoneLink, { clinicPhoneDisplay } from '../components/ClinicPhoneLink'
import { EmptyState, ErrorState, LoadingState } from '../components/PageState'
import { formatDate, formatInterval, titleCase } from '../format'
import { planFrom, treatmentPlanView } from '../portalData'

export default function TreatmentPlanPage() {
  const [plan, setPlan] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setPlan(treatmentPlanView(planFrom(await api.getTreatmentPlan())))
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
        <p className="text-xs font-extrabold uppercase tracking-[.18em] text-brand/60">Ongoing care</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">Treatment plan</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-ink/50">
          Follow the patient-safe plan and care schedule published by your dental team.
        </p>
      </section>

      {loading ? (
        <LoadingState label="Loading your treatment plan…" />
      ) : error ? (
        <ErrorState error={error} onRetry={load} />
      ) : plan ? (
        <div className="grid gap-6 xl:grid-cols-[1.35fr_.75fr]">
          <section className="overflow-hidden rounded-[32px] bg-white soft-shadow">
            <div className="relative overflow-hidden bg-brand px-6 py-8 text-white sm:px-8">
              <div className="absolute -right-12 -top-20 h-56 w-56 rounded-full border-[35px] border-white/8" />
              <div className="relative">
                <div className="mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-white/12">
                  <Sparkles size={23} />
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-2xl font-extrabold sm:text-3xl">{plan.title}</h2>
                  <span className="rounded-full bg-white/12 px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider">
                    {titleCase(plan.status)}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-6 sm:p-8">
              <h3 className="text-xs font-extrabold uppercase tracking-[.16em] text-brand/60">Your care summary</h3>
              <p className="mt-3 whitespace-pre-line text-sm leading-7 text-ink/65">
                {plan.summary || 'Contact the clinic if you have questions about this treatment plan.'}
              </p>

              <dl className="mt-7 grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl bg-cream p-4">
                  <dt className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-ink/40">
                    <CalendarDays size={14} />
                    Started
                  </dt>
                  <dd className="mt-2 text-sm font-extrabold">{formatDate(plan.startedOn)}</dd>
                </div>
                <div className="rounded-2xl bg-cream p-4">
                  <dt className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-ink/40">
                    <Clock3 size={14} />
                    Expected interval
                  </dt>
                  <dd className="mt-2 text-sm font-extrabold">{formatInterval(plan.intervalDays)}</dd>
                </div>
              </dl>
            </div>
          </section>

          <aside className="space-y-5">
            <section className="rounded-3xl bg-[#dff3ef] p-6">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-brand">
                <CalendarCheck2 size={21} />
              </div>
              <p className="mt-5 text-xs font-extrabold uppercase tracking-[.16em] text-brand/60">Recommended next care</p>
              <p className="mt-2 text-xl font-extrabold">{formatDate(plan.nextRecommendedOn)}</p>
              <div className="mt-4 flex gap-2 rounded-2xl bg-white/65 p-3 text-xs leading-5 text-ink/55">
                <CalendarSearch className="mt-0.5 shrink-0 text-brand" size={16} />
                <p>This is your dentist’s recommendation. It is not a booked appointment.</p>
              </div>
            </section>

            <section className="rounded-3xl bg-[#f4dfc9] p-6">
              <h2 className="text-lg font-extrabold">Ready to check your schedule?</h2>
              <p className="mt-2 text-xs leading-5 text-ink/55">
                View booked visits first, or call the clinic to ask about this recommendation.
              </p>
              <ClinicPhoneLink className="mt-5 inline-flex items-center gap-2 text-sm font-extrabold text-[#915020]">
                <Phone size={15} />
                {clinicPhoneDisplay}
              </ClinicPhoneLink>
            </section>
          </aside>
        </div>
      ) : (
        <EmptyState
          icon={Sparkles}
          title="No active treatment plan"
          message="There is no patient-visible treatment plan at this time. Ask the clinic if you expected to see one."
          action={(
            <ClinicPhoneLink className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-xs font-extrabold text-white">
              <Phone size={14} />
              Contact clinic
            </ClinicPhoneLink>
          )}
        />
      )}
    </>
  )
}
