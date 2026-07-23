import { AlertCircle, CloudOff, Inbox, LoaderCircle } from 'lucide-react'

export function LoadingState({ label = 'Loading your information…' }) {
  return (
    <div className="grid min-h-64 place-items-center rounded-3xl bg-white p-8 text-center" role="status">
      <div>
        <LoaderCircle className="mx-auto animate-spin text-brand" size={28} />
        <p className="mt-3 text-sm font-semibold text-ink/55">{label}</p>
      </div>
    </div>
  )
}

export function ErrorState({ error, onRetry }) {
  const offline = error?.offline || !navigator.onLine
  const Icon = offline ? CloudOff : AlertCircle

  return (
    <div className="grid min-h-64 place-items-center rounded-3xl bg-white p-8 text-center" role="alert">
      <div className="max-w-sm">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#fde5d4] text-[#a85825]">
          <Icon size={22} />
        </div>
        <h2 className="mt-4 text-lg font-extrabold">
          {offline ? 'You appear to be offline' : 'We could not load this page'}
        </h2>
        <p className="mt-2 text-sm leading-6 text-ink/50">
          {offline
            ? 'Check your internet connection, then try again.'
            : 'Your information is safe. Please try again in a moment.'}
        </p>
        {onRetry && (
          <button className="mt-5 rounded-xl bg-brand px-5 py-3 text-sm font-extrabold text-white hover:bg-brand-dark" onClick={onRetry}>
            Try again
          </button>
        )}
      </div>
    </div>
  )
}

export function EmptyState({ title, message, icon: Icon = Inbox, action }) {
  return (
    <div className="grid min-h-56 place-items-center rounded-3xl border border-dashed border-brand/20 bg-white/55 p-8 text-center">
      <div className="max-w-sm">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-mint text-brand">
          <Icon size={22} />
        </div>
        <h2 className="mt-4 text-base font-extrabold">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-ink/50">{message}</p>
        {action}
      </div>
    </div>
  )
}
