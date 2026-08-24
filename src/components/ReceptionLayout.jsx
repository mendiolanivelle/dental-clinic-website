import { useCallback, useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  CalendarDays,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  ShieldCheck,
  UsersRound,
  X,
} from 'lucide-react'
import BrandLogo from './BrandLogo'

const navigation = [
  { label: 'Overview', to: '/reception', icon: LayoutDashboard, end: true },
  { label: 'Booking requests', to: '/reception/requests', icon: ClipboardList },
  { label: 'Calendar', to: '/reception/calendar', icon: CalendarDays },
  { label: 'Patients', to: '/reception/patients', icon: UsersRound },
]

const initials = (name = '') =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'R'

function Sidebar({ open, close, onLogout }) {
  const closeButton = useRef(null)
  const location = useLocation()
  const [loggingOut, setLoggingOut] = useState(false)

  useEffect(() => close(), [close, location.pathname])
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

  return <>
    {open && <button aria-label="Close navigation" className="fixed inset-0 z-30 bg-ink/35 backdrop-blur-sm lg:hidden" onClick={close} />}
    <aside
      id="reception-navigation"
      className={`sidebar-shadow fixed inset-y-0 left-0 z-40 flex w-[285px] flex-col overflow-y-auto bg-white px-5 py-7 transition-transform duration-300 lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}
    >
      <div className="mb-8 flex items-center justify-between px-2">
        <BrandLogo />
        <button ref={closeButton} aria-label="Close navigation" className="rounded-xl p-2 text-ink/60 hover:bg-mint lg:hidden" onClick={close}>
          <X size={20} />
        </button>
      </div>
      <p className="mb-3 px-4 text-[10px] font-extrabold uppercase tracking-[.2em] text-ink/35">Reception menu</p>
      <nav className="space-y-1" aria-label="Reception portal">
        {navigation.map(({ label, to, icon: Icon, end }) => (
          <NavLink
            key={to}
            end={end}
            to={to}
            className={({ isActive }) => `flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition ${isActive ? 'bg-brand text-white shadow-lg shadow-teal-900/15' : 'text-ink/60 hover:bg-mint/70 hover:text-brand'}`}
          >
            <Icon size={19} />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto pt-8">
        <div className="mb-4 rounded-3xl bg-cream p-4">
          <ShieldCheck className="text-brand" size={20} />
          <p className="mt-3 text-sm font-bold">Private clinic workspace</p>
          <p className="mt-1 text-xs leading-5 text-ink/50">Use only the patient information needed for today’s clinic work.</p>
        </div>
        <button
          className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-ink/55 hover:bg-[#fde5d4] hover:text-[#9a4e22]"
          disabled={loggingOut}
          onClick={async () => {
            setLoggingOut(true)
            try { await onLogout() } finally { setLoggingOut(false) }
          }}
        >
          <LogOut size={19} />
          {loggingOut ? 'Logging out…' : 'Log out'}
        </button>
      </div>
    </aside>
  </>
}

export default function ReceptionLayout({ staff, onLogout }) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])

  return (
    <div className="min-h-screen bg-cream">
      <a href="#reception-content" className="fixed left-4 top-3 z-50 -translate-y-20 rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white focus:translate-y-0">Skip to content</a>
      <Sidebar open={open} close={close} onLogout={onLogout} />
      <div className="min-h-screen lg:ml-[285px]">
        <header className="border-b border-ink/5 bg-cream/90 backdrop-blur">
          <div className="mx-auto flex max-w-[1500px] items-center gap-3 px-5 py-5 sm:px-8 lg:px-10 xl:px-14">
            <button aria-label="Open navigation" aria-controls="reception-navigation" aria-expanded={open} className="rounded-2xl bg-white p-3 text-ink shadow-sm lg:hidden" onClick={() => setOpen(true)}>
              <Menu size={21} />
            </button>
            <div className="hidden items-center gap-2 text-xs font-bold text-brand/70 sm:flex">
              <ShieldCheck size={16} /> Secure reception portal
            </div>
            <div className="ml-auto flex items-center gap-3 rounded-2xl bg-white py-1.5 pl-1.5 pr-3 shadow-sm">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-mint text-sm font-extrabold text-brand">{initials(staff.displayName)}</div>
              <div className="hidden text-left sm:block">
                <p className="max-w-44 truncate text-xs font-extrabold">{staff.displayName}</p>
                <p className="text-[10px] capitalize text-ink/40">{staff.role}</p>
              </div>
            </div>
          </div>
        </header>
        <main id="reception-content" className="mx-auto max-w-[1500px] px-5 py-8 sm:px-8 lg:px-10 lg:py-10 xl:px-14">
          <Outlet context={{ staff }} />
        </main>
      </div>
    </div>
  )
}
