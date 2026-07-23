import { useEffect, useState } from 'react'
import { ArrowLeft, CheckCircle2, Clock3, RefreshCw, ShieldCheck } from 'lucide-react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { api } from '../api'
import AuthLayout from '../components/AuthLayout'

const CODE_LIFETIME_MS = 5 * 60 * 1000
const RESEND_COOLDOWN_MS = 30 * 1000

function countdown(milliseconds) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

export default function VerifyPage({ onAuthenticated }) {
  const location = useLocation()
  const initialChallengeId = location.state?.challengeId
  const startedAt = location.state?.startedAt || Date.now()
  const [challengeId, setChallengeId] = useState(initialChallengeId)
  const [expiresAt, setExpiresAt] = useState(startedAt + CODE_LIFETIME_MS)
  const [resendAt, setResendAt] = useState(Date.now() + RESEND_COOLDOWN_MS)
  const [now, setNow] = useState(Date.now())
  const [code, setCode] = useState('')
  const [message, setMessage] = useState(location.state?.message || 'If the details match our records, a verification code was sent.')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [resending, setResending] = useState(false)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  if (!initialChallengeId) return <Navigate replace to="/login" />

  const expired = now >= expiresAt
  const resendSeconds = Math.max(0, Math.ceil((resendAt - now) / 1000))

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    if (!/^\d{6}$/.test(code)) {
      setError('Enter the complete six-digit code.')
      return
    }

    setSubmitting(true)
    try {
      const result = await api.verifyLogin({ challengeId, code })
      onAuthenticated(result?.patient || result)
    } catch {
      setCode('')
      setError('The code could not be verified. Try again or request a new code.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleResend() {
    setError('')
    setResending(true)
    try {
      const result = await api.resendCode(challengeId)
      setChallengeId(result?.challengeId || challengeId)
      setExpiresAt(Date.now() + CODE_LIFETIME_MS)
      setResendAt(Date.now() + RESEND_COOLDOWN_MS)
      setMessage(result?.message || 'If the details match our records, a new verification code was sent.')
      setCode('')
    } catch {
      setError('We could not send another code. Please wait and try again.')
    } finally {
      setResending(false)
    }
  }

  return (
    <AuthLayout
      title="Check your messages"
      description="Enter the six-digit verification code sent to the mobile number registered with the clinic."
    >
      <div className="mb-6 flex gap-3 rounded-2xl bg-mint/65 p-4 text-sm leading-6 text-ink/60" role="status">
        <CheckCircle2 className="mt-0.5 shrink-0 text-brand" size={19} />
        <p>{message}</p>
      </div>

      <form onSubmit={handleSubmit}>
        <label className="mb-3 block text-sm font-extrabold" htmlFor="verificationCode">
          Six-digit verification code
        </label>
        <input
          id="verificationCode"
          name="verificationCode"
          type="text"
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength="6"
          autoComplete="one-time-code"
          className="input-field text-center text-2xl font-extrabold tracking-[.45em]"
          placeholder="000000"
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
          disabled={submitting || expired}
          autoFocus
          required
        />

        <div className={`mt-3 flex items-center justify-center gap-1.5 text-xs font-bold ${
          expired ? 'text-[#a85825]' : 'text-ink/45'
        }`}>
          <Clock3 size={14} />
          {expired ? 'This code has expired. Request a new one.' : `Code expires in ${countdown(expiresAt - now)}`}
        </div>

        {error && (
          <p className="mt-4 rounded-2xl bg-[#fff0e7] px-4 py-3 text-sm leading-6 text-[#914b22]" role="alert">
            {error}
          </p>
        )}

        <button
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand px-5 py-3.5 text-sm font-extrabold text-white shadow-lg shadow-teal-900/15 hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
          type="submit"
          disabled={submitting || expired || code.length !== 6}
        >
          <ShieldCheck size={18} />
          {submitting ? 'Verifying…' : 'Verify and open portal'}
        </button>
      </form>

      <div className="mt-6 text-center">
        <p className="text-xs text-ink/45">Didn’t receive a code?</p>
        <button
          className="mt-2 inline-flex items-center gap-1.5 text-sm font-extrabold text-brand hover:text-brand-dark disabled:cursor-not-allowed disabled:text-ink/30"
          type="button"
          disabled={resendSeconds > 0 || resending}
          onClick={handleResend}
        >
          <RefreshCw className={resending ? 'animate-spin' : ''} size={15} />
          {resending ? 'Sending…' : resendSeconds > 0 ? `Resend in ${resendSeconds}s` : 'Send a new code'}
        </button>
      </div>

      <Link className="mt-6 flex items-center justify-center gap-1.5 border-t border-ink/8 pt-5 text-sm font-bold text-ink/55 hover:text-brand" to="/login">
        <ArrowLeft size={16} />
        Use different details
      </Link>
    </AuthLayout>
  )
}
