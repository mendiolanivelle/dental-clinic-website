import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { ArrowRight, Clock3, IdCard, LockKeyhole, Phone, Sparkles, UserRound } from 'lucide-react'
import { api } from '../api'
import AuthLayout from '../components/AuthLayout'
import ClinicPhoneLink from '../components/ClinicPhoneLink'

const services = [
  {
    name: 'Dental check-up',
    description: 'A complete oral exam to keep your smile healthy and catch concerns early.',
    details: '30–45 minutes · Consultation',
  },
  {
    name: 'Professional cleaning',
    description: 'A gentle cleaning that removes plaque and helps protect your teeth and gums.',
    details: '45–60 minutes · Preventive care',
  },
  {
    name: 'Tooth filling',
    description: 'Restore a damaged tooth and make everyday eating comfortable again.',
    details: '30–60 minutes · Restorative care',
  },
  {
    name: 'Braces adjustment',
    description: 'Regular orthodontic visits to check progress and adjust your braces safely.',
    details: '30–45 minutes · Orthodontics',
  },
  {
    name: 'Teeth whitening',
    description: 'Brighten your smile with a treatment plan selected for your teeth.',
    details: '60–90 minutes · Cosmetic care',
  },
  {
    name: 'Tooth extraction',
    description: 'Comfort-focused removal when a tooth cannot be safely restored.',
    details: '30–60 minutes · Consultation required',
  },
]

function ServicesPanel() {
  return (
    <div className="rounded-[28px] bg-white p-5 text-ink shadow-xl sm:p-6">
      <div className="mb-6">
        <div>
          <div className="flex items-center gap-2 text-brand">
            <Sparkles size={18} />
            <span className="text-xs font-extrabold uppercase tracking-[.16em]">Care options</span>
          </div>
          <h2 className="mt-2 text-2xl font-extrabold tracking-tight">Dental services</h2>
          <p className="mt-2 text-sm leading-6 text-ink/55">Explore our services, then call the clinic to ask a question or request an appointment.</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {services.map((service) => (
          <article className="rounded-2xl border border-ink/8 bg-cream/65 p-4 transition hover:border-brand/25 hover:bg-mint/35" key={service.name}>
            <h3 className="font-extrabold">{service.name}</h3>
            <p className="mt-2 text-xs leading-5 text-ink/55">{service.description}</p>
            <p className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-bold text-brand/75">
              <Clock3 size={13} />
              {service.details}
            </p>
          </article>
        ))}
      </div>

      <div className="mt-5 rounded-2xl bg-mint/65 px-4 py-3 text-xs leading-5 text-ink/60">
        Service availability and fees depend on your dental assessment. Please contact the clinic for current pricing.
      </div>
    </div>
  )
}

export default function LoginPage({ onAuthenticated }) {
  const location = useLocation()
  const [fullName, setFullName] = useState('')
  const [patientNumber, setPatientNumber] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showServices, setShowServices] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')

    if (!fullName.trim() || !patientNumber.trim()) {
      setError('Enter your full name and patient ID to continue.')
      return
    }

    setSubmitting(true)
    try {
      const result = await api.login({
        fullName: fullName.trim(),
        patientNumber: patientNumber.trim().toUpperCase(),
      })
      onAuthenticated(result.patient)
    } catch (requestError) {
      setError(
        requestError.status === 429
          ? requestError.message
          : 'The name or patient ID is not recognized. Please check both details or call the clinic.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      description="Enter the details provided by your clinic to securely view your dental care information."
      servicesContent={<ServicesPanel />}
      onServicesClick={() => setShowServices((visible) => !visible)}
      servicesActive={showServices}
    >
      <>
      {location.state?.sessionExpired && (
        <div className="mb-5 rounded-2xl bg-[#fff4e9] px-4 py-3 text-sm leading-6 text-[#8b4d21]" role="status">
          Your session expired to keep your records private. Please sign in again.
        </div>
      )}

      <form className="space-y-5 lg:space-y-4" onSubmit={handleSubmit}>
        <div>
          <label className="mb-2 block text-sm font-extrabold" htmlFor="fullName">
            Full name as recorded by the clinic
          </label>
          <div className="relative">
            <UserRound className="absolute left-4 top-1/2 -translate-y-1/2 text-ink/30" size={18} />
            <input
              id="fullName"
              name="fullName"
              type="text"
              autoComplete="name"
              autoCapitalize="words"
              className="input-field"
              placeholder="First Middle Last"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              disabled={submitting}
              required
            />
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-extrabold" htmlFor="patientNumber">
            Patient ID
          </label>
          <div className="relative">
            <IdCard className="absolute left-4 top-1/2 -translate-y-1/2 text-ink/30" size={18} />
            <input
              id="patientNumber"
              name="patientNumber"
              type="text"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck="false"
              className="input-field uppercase"
              placeholder="PT-7K4N9Q"
              value={patientNumber}
              onChange={(event) => setPatientNumber(event.target.value)}
              disabled={submitting}
              required
            />
          </div>
          <p className="mt-2 text-xs leading-5 text-ink/45">
            Your patient ID is on the card or instructions given by the clinic.
          </p>
        </div>

        {error && (
          <p className="rounded-2xl bg-[#fff0e7] px-4 py-3 text-sm leading-6 text-[#914b22]" role="alert">
            {error}
          </p>
        )}

        <button
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand px-5 py-3.5 text-sm font-extrabold text-white shadow-lg shadow-teal-900/15 hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
          type="submit"
          disabled={submitting}
        >
          {submitting ? 'Signing in…' : 'Open my portal'}
          {!submitting && <ArrowRight size={18} />}
        </button>
      </form>

      <div className="mt-6 flex gap-3 rounded-2xl bg-mint/65 p-4 lg:mt-4">
        <LockKeyhole className="mt-0.5 shrink-0 text-brand" size={18} />
        <p className="text-xs leading-5 text-ink/60">
          Use the exact full name and patient ID recorded by the clinic.
        </p>
      </div>

      <div className="mt-6 border-t border-ink/8 pt-5 text-center lg:mt-4">
        <p className="text-xs text-ink/50">Don’t have your patient ID?</p>
        <ClinicPhoneLink className="mt-2 inline-flex items-center gap-1.5 text-sm font-extrabold text-brand hover:text-brand-dark">
          <Phone size={15} />
          Call the clinic
        </ClinicPhoneLink>
      </div>
      </>
    </AuthLayout>
  )
}
