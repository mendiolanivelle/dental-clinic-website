import { useCallback, useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  CalendarDays,
  CircleHelp,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Phone,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
} from 'lucide-react'
import BrandLogo from './BrandLogo'
import ClinicPhoneLink from './ClinicPhoneLink'

const navigation = [
  { label: 'Overview', to: '/portal', icon: LayoutDashboard, end: true },
  { label: 'Appointments', to: '/portal/appointments', icon: CalendarDays },
  { label: 'My records', to: '/portal/records', icon: FileText },
  { label: 'Treatment plan', to: '/portal/treatment-plan', icon: Sparkles },
]

function displayName(patient) {
  return patient?.displayName || patient?.display_name || patient?.name || 'Patient'
}

function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'P'
}

function Sidebar({ open, close, onLogout }) {
  const closeButton = useRef(null)
  const location = useLocation()
  const [logoutError, setLogoutError] = useState('')
  const [loggingOut, setLoggingOut] = useState(false)

  useEffect(() => {
    close()
  }, [close, location.pathname])

  useEffect(() => {
    if (!open) return undefined
    closeButton.current?.focus()
    const onKeyDown = (event) => event.key === 'Escape' && close()
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, close])

  async function handleLogout() {
    setLogoutError('')
    setLoggingOut(true)
    try {
      await onLogout()
    } catch {
      setLogoutError('We could not securely log you out. Please try again before leaving this device.')
      setLoggingOut(false)
    }
  }

  return (
    <>
      {open && (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-ink/35 backdrop-blur-sm lg:hidden"
          onClick={close}
        />
      )}
      <aside
        id="portal-navigation"
        className={`sidebar-shadow fixed inset-y-0 left-0 z-40 flex w-[285px] flex-col overflow-y-auto bg-white px-5 py-7 transition-transform duration-300 lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="mb-8 flex items-center justify-between px-2">
          <BrandLogo />
          <button
            ref={closeButton}
            aria-label="Close navigation"
            className="rounded-xl p-2 text-ink/60 hover:bg-mint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand lg:hidden"
            onClick={close}
          >
            <X size={20} />
          </button>
        </div>

        <p className="mb-3 px-4 text-[10px] font-extrabold uppercase tracking-[.2em] text-ink/35">
          Patient menu
        </p>
        <nav className="space-y-1" aria-label="Patient portal">
          {navigation.map(({ label, to, icon: Icon, end }) => (
            <NavLink
              key={to}
              end={end}
              to={to}
              className={({ isActive }) => `flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                isActive
                  ? 'bg-brand text-white shadow-lg shadow-teal-900/15'
                  : 'text-ink/60 hover:bg-mint/70 hover:text-brand'
              }`}
            >
              <Icon size={19} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto pt-8">
          <div className="mb-5 rounded-3xl bg-cream p-4">
            <div className="mb-3 grid h-9 w-9 place-items-center rounded-xl bg-white text-brand">
              <CircleHelp size={18} />
            </div>
            <p className="text-sm font-bold">Need some help?</p>
            <p className="mt-1 text-xs leading-5 text-ink/50">
              Call the clinic for account or rescheduling assistance.
            </p>
            <ClinicPhoneLink className="mt-3 inline-flex items-center gap-1.5 text-xs font-extrabold text-brand">
              <Phone size={13} />
              Contact clinic
            </ClinicPhoneLink>
          </div>
          <NavLink
            to="/portal/profile"
            className={({ isActive }) => `flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold ${
              isActive ? 'bg-mint text-brand' : 'text-ink/55 hover:bg-mint'
            }`}
          >
            <UserRound size={19} />
            Profile
          </NavLink>
          <button
            className="mt-1 flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-ink/55 hover:bg-[#fde5d4] hover:text-[#9a4e22]"
            disabled={loggingOut}
            onClick={handleLogout}
          >
            <LogOut size={19} />
            {loggingOut ? 'Logging out…' : 'Log out'}
          </button>
          {logoutError && (
            <p className="mt-2 rounded-xl bg-[#fff0e7] px-3 py-2 text-xs leading-5 text-[#914b22]" role="alert">
              {logoutError}
            </p>
          )}
        </div>
      </aside>
    </>
  )
}

export default function PortalLayout({ patient, onLogout }) {
  const [open, setOpen] = useState(false)
  const name = displayName(patient)
  const closeSidebar = useCallback(() => setOpen(false), [])

  return (
    <div className="min-h-screen bg-cream">
      <a
        href="#portal-content"
        className="fixed left-4 top-3 z-50 -translate-y-20 rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white focus:translate-y-0"
      >
        Skip to content
      </a>
      <Sidebar open={open} close={closeSidebar} onLogout={onLogout} />
      <div className="min-h-screen lg:ml-[285px]">
        <header className="border-b border-ink/5 bg-cream/90 backdrop-blur">
          <div className="mx-auto flex max-w-[1500px] items-center gap-3 px-5 py-5 sm:px-8 lg:px-10 xl:px-14">
            <button
              aria-label="Open navigation"
              aria-controls="portal-navigation"
              aria-expanded={open}
              className="rounded-2xl bg-white p-3 text-ink shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand lg:hidden"
              onClick={() => setOpen(true)}
            >
              <Menu size={21} />
            </button>
            <div className="hidden items-center gap-2 text-xs font-bold text-brand/70 sm:flex">
              <ShieldCheck size={16} />
              Secure patient portal
            </div>
            <NavLink
              aria-label="Open profile"
              className="ml-auto flex items-center gap-3 rounded-2xl bg-white py-1.5 pl-1.5 pr-3 shadow-sm hover:ring-2 hover:ring-brand/10"
              to="/portal/profile"
            >
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#fde5d4] text-sm font-extrabold text-[#a85825]">
                {initials(name)}
              </div>
              <div className="hidden text-left sm:block">
                <p className="max-w-44 truncate text-xs font-extrabold">{name}</p>
                <p className="text-[10px] text-ink/40">Patient</p>
              </div>
            </NavLink>
          </div>
        </header>

        <main id="portal-content" className="mx-auto max-w-[1500px] px-5 py-8 sm:px-8 lg:px-10 lg:py-10 xl:px-14">
          <Outlet context={{ patient }} />
        </main>
      </div>
    </div>
  )
}
