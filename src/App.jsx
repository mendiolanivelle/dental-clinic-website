import { useCallback, useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { CloudOff, LoaderCircle, RefreshCw } from 'lucide-react'
import { api } from './api'
import BrandLogo from './components/BrandLogo'
import PortalLayout from './components/PortalLayout'
import AppointmentsPage from './pages/AppointmentsPage'
import DashboardPage from './pages/DashboardPage'
import LoginPage from './pages/LoginPage'
import ProfilePage from './pages/ProfilePage'
import RecordsPage from './pages/RecordsPage'
import TreatmentPlanPage from './pages/TreatmentPlanPage'
import ReceptionLayout from './components/ReceptionLayout'
import ReceptionCalendarPage from './pages/ReceptionCalendarPage'
import ReceptionDashboardPage from './pages/ReceptionDashboardPage'
import ReceptionBillingPage from './pages/ReceptionBillingPage'
import ReceptionPatientsPage from './pages/ReceptionPatientsPage'
import ReceptionRequestsPage from './pages/ReceptionRequestsPage'
import { patientFrom } from './portalData'

function AppLoading() {
  return (
    <main className="grid min-h-screen place-items-center bg-cream p-6" role="status">
      <div className="text-center">
        <div className="flex justify-center"><BrandLogo /></div>
        <LoaderCircle className="mx-auto mt-8 animate-spin text-brand" size={28} />
        <p className="mt-3 text-sm font-semibold text-ink/50">Opening the secure portal…</p>
      </div>
    </main>
  )
}

function AppUnavailable({ error, onRetry }) {
  const offline = error?.offline || !navigator.onLine
  return (
    <main className="grid min-h-screen place-items-center bg-cream p-6">
      <div className="w-full max-w-md rounded-[30px] bg-white p-8 text-center soft-shadow">
        <div className="flex justify-center"><BrandLogo /></div>
        <div className="mx-auto mt-8 grid h-12 w-12 place-items-center rounded-2xl bg-[#fff0e7] text-[#914b22]">
          <CloudOff size={22} />
        </div>
        <h1 className="mt-4 text-xl font-extrabold">
          {offline ? 'You appear to be offline' : 'The portal is temporarily unavailable'}
        </h1>
        <p className="mt-2 text-sm leading-6 text-ink/50">
          {offline ? 'Reconnect to the internet, then try again.' : 'Your information is safe. Please try again in a moment.'}
        </p>
        <button className="mt-6 inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-extrabold text-white hover:bg-brand-dark" onClick={onRetry}>
          <RefreshCw size={16} />
          Try again
        </button>
      </div>
    </main>
  )
}

export default function App() {
  const [auth, setAuth] = useState({ status: 'loading', kind: null, user: null, error: null })
  const [sessionExpired, setSessionExpired] = useState(false)

  const loadSession = useCallback(async () => {
    setAuth({ status: 'loading', kind: null, user: null, error: null })
    try {
      const staffResult = await api.getStaffMe({ notifyUnauthorized: false })
      setAuth({ status: 'authenticated', kind: 'staff', user: staffResult.staff, error: null })
      setSessionExpired(false)
      return
    } catch (error) {
      if (error.status !== 401) {
        setAuth({ status: 'error', kind: null, user: null, error })
        return
      }
    }
    try {
      const result = await api.getMe({ notifyUnauthorized: false })
      setAuth({ status: 'authenticated', kind: 'patient', user: patientFrom(result), error: null })
      setSessionExpired(false)
    } catch (error) {
      if (error.status === 401) {
        setAuth({ status: 'unauthenticated', kind: null, user: null, error: null })
      } else {
        setAuth({ status: 'error', kind: null, user: null, error })
      }
    }
  }, [])

  useEffect(() => {
    loadSession()
  }, [loadSession])

  useEffect(() => {
    const expireSession = () => {
      setAuth({ status: 'unauthenticated', kind: null, user: null, error: null })
      setSessionExpired(true)
    }
    window.addEventListener('portal:unauthorized', expireSession)
    return () => window.removeEventListener('portal:unauthorized', expireSession)
  }, [])

  function handleAuthenticated(patient) {
    setAuth({ status: 'authenticated', kind: 'patient', user: patientFrom(patient), error: null })
    setSessionExpired(false)
  }

  function handleStaffAuthenticated(staff) {
    setAuth({ status: 'authenticated', kind: 'staff', user: staff, error: null })
    setSessionExpired(false)
  }

  async function handleLogout() {
    await (auth.kind === 'staff' ? api.staffLogout() : api.logout())
    setAuth({ status: 'unauthenticated', kind: null, user: null, error: null })
    setSessionExpired(false)
  }

  if (auth.status === 'loading') return <AppLoading />
  if (auth.status === 'error') return <AppUnavailable error={auth.error} onRetry={loadSession} />

  const authenticated = auth.status === 'authenticated'
  const home = auth.kind === 'staff' ? '/reception' : '/portal'

  return (
    <Routes>
      <Route
        path="/login"
        element={authenticated
          ? <Navigate replace to={home} />
          : <LoginPage onAuthenticated={handleAuthenticated} onStaffAuthenticated={handleStaffAuthenticated} />}
      />
      <Route
        path="/portal"
        element={authenticated && auth.kind === 'patient'
          ? <PortalLayout patient={auth.user} onLogout={handleLogout} />
          : <Navigate replace state={{ sessionExpired }} to="/login" />}
      >
        <Route index element={<DashboardPage />} />
        <Route path="appointments" element={<AppointmentsPage />} />
        <Route path="records" element={<RecordsPage />} />
        <Route path="treatment-plan" element={<TreatmentPlanPage />} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>
      <Route
        path="/reception"
        element={authenticated && auth.kind === 'staff'
          ? <ReceptionLayout staff={auth.user} onLogout={handleLogout} />
          : <Navigate replace state={{ sessionExpired }} to="/login" />}
      >
        <Route index element={<ReceptionDashboardPage />} />
        <Route path="requests" element={<ReceptionRequestsPage />} />
        <Route path="calendar" element={<ReceptionCalendarPage />} />
        <Route path="billing" element={<ReceptionBillingPage />} />
        <Route path="patients" element={<ReceptionPatientsPage />} />
      </Route>
      <Route path="*" element={<Navigate replace to={authenticated ? home : '/login'} />} />
    </Routes>
  )
}
