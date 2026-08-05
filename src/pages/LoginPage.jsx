import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { ArrowRight, IdCard, LockKeyhole, Phone, UserRound } from 'lucide-react'
import { api } from '../api'
import AuthLayout from '../components/AuthLayout'
import ClinicPhoneLink from '../components/ClinicPhoneLink'

export default function LoginPage({ onAuthenticated }) {
  const location = useLocation()
  const [fullName, setFullName] = useState('')
  const [patientNumber, setPatientNumber] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

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
    >
      {location.state?.sessionExpired && (
        <div className="mb-5 rounded-2xl bg-[#fff4e9] px-4 py-3 text-sm leading-6 text-[#8b4d21]" role="status">
          Your session expired to keep your records private. Please sign in again.
        </div>
      )}

      <form className="space-y-5" onSubmit={handleSubmit}>
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
              className="input-field pl-11"
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
              className="input-field pl-11 uppercase"
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

      <div className="mt-6 flex gap-3 rounded-2xl bg-mint/65 p-4">
        <LockKeyhole className="mt-0.5 shrink-0 text-brand" size={18} />
        <p className="text-xs leading-5 text-ink/60">
          Use the exact full name and patient ID recorded by the clinic.
        </p>
      </div>

      <div className="mt-6 border-t border-ink/8 pt-5 text-center">
        <p className="text-xs text-ink/50">Don’t have your patient ID?</p>
        <ClinicPhoneLink className="mt-2 inline-flex items-center gap-1.5 text-sm font-extrabold text-brand hover:text-brand-dark">
          <Phone size={15} />
          Call the clinic
        </ClinicPhoneLink>
      </div>
    </AuthLayout>
  )
}
