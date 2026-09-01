import { useCallback, useEffect, useState } from 'react'
import { KeyRound, LogOut, ShieldOff, Stethoscope, UserPlus, UsersRound } from 'lucide-react'
import { api } from '../api'
import { ErrorState, LoadingState } from '../components/PageState'
import { formatDate, titleCase } from '../format'

const emptyForm = { displayName: '', specialty: '', password: '' }

export default function AdminTeamPage() {
  const [state, setState] = useState({ loading: true, staff: [], error: null })
  const [role, setRole] = useState('dentist')
  const [form, setForm] = useState(emptyForm)
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [formError, setFormError] = useState('')
  const load = useCallback(() => {
    setState((current) => ({ ...current, loading: true, error: null }))
    api.getAdminTeam().then(({ staff }) => setState({ loading: false, staff, error: null })).catch((error) => setState({ loading: false, staff: [], error }))
  }, [])
  useEffect(load, [load])

  const submit = async (event) => {
    event.preventDefault()
    setBusy('create')
    setFormError('')
    try {
      const details = { displayName: form.displayName.trim(), password: form.password, ...(role === 'dentist' ? { specialty: form.specialty.trim() } : {}) }
      await (role === 'dentist' ? api.createAdminDentist(details) : api.createAdminReceptionist(details))
      setForm(emptyForm)
      setMessage(`${role === 'dentist' ? 'Dentist' : 'Receptionist'} account created.`)
      await load()
    } catch (error) {
      setFormError(error.message)
    } finally {
      setBusy('')
    }
  }

  const act = async (staff, action) => {
    if (action === 'status' && !window.confirm(`${staff.active ? 'Deactivate' : 'Reactivate'} ${staff.displayName}?${staff.active ? ' Their active sessions will end.' : ''}`)) return
    let password
    if (action === 'password') {
      password = window.prompt(`Enter a new password for ${staff.displayName} (at least 8 numbers).`)
      if (!password) return
      if (!/^\d{8,72}$/.test(password)) { setFormError('Passwords must contain 8–72 numbers only.'); return }
    }
    if (action === 'sessions' && !window.confirm(`End all active sessions for ${staff.displayName}?`)) return
    setBusy(`${action}-${staff.id}`)
    setFormError('')
    try {
      if (action === 'status') await api.setAdminStaffActive(staff.id, !staff.active)
      if (action === 'password') await api.resetAdminStaffPassword(staff.id, password)
      if (action === 'sessions') await api.revokeAdminStaffSessions(staff.id)
      setMessage(action === 'status' ? 'Account status updated.' : action === 'password' ? 'Password reset and active sessions revoked.' : 'Active sessions revoked.')
      await load()
    } catch (error) {
      setFormError(error.message)
    } finally {
      setBusy('')
    }
  }

  if (state.loading && !state.staff.length) return <LoadingState label="Loading team accounts…" />
  if (state.error) return <ErrorState error={state.error} onRetry={load} />

  return <>
    <div className="mb-8"><p className="text-xs font-extrabold uppercase tracking-[.18em] text-brand/60">Access administration</p><h1 className="mt-2 text-3xl font-extrabold tracking-tight">Team accounts</h1><p className="mt-2 text-sm text-ink/50">Create and manage name-based clinic staff access. Existing passwords are never shown.</p></div>
    {message && <p className="mb-5 rounded-2xl bg-mint p-4 text-sm font-bold text-brand" role="status">{message}</p>}
    {formError && <p className="mb-5 rounded-2xl bg-[#fff0e7] p-4 text-sm font-bold text-[#914b22]" role="alert">{formError}</p>}
    <section className="mb-8 rounded-3xl bg-white p-5 soft-shadow sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-extrabold">Add a staff account</h2><p className="mt-1 text-xs text-ink/45">Dentist accounts are automatically linked to a clinical dentist profile.</p></div><div className="inline-flex rounded-xl bg-cream p-1">{['dentist', 'receptionist'].map((value) => <button className={`rounded-lg px-3 py-2 text-xs font-extrabold ${role === value ? 'bg-brand text-white' : 'text-ink/50'}`} key={value} type="button" onClick={() => setRole(value)}>{titleCase(value)}</button>)}</div></div><form className="mt-5 grid gap-4 lg:grid-cols-4 lg:items-end" onSubmit={submit}><label className="text-xs font-extrabold text-ink/55">Full login name<input className="mt-2 w-full rounded-xl border border-ink/10 px-3 py-3 text-sm" required minLength="2" maxLength="160" value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} placeholder={role === 'dentist' ? 'Dr. First Middle Last' : 'First Middle Last'} /></label>{role === 'dentist' && <label className="text-xs font-extrabold text-ink/55">Specialty<input className="mt-2 w-full rounded-xl border border-ink/10 px-3 py-3 text-sm" maxLength="120" value={form.specialty} onChange={(event) => setForm({ ...form, specialty: event.target.value })} placeholder="General dentistry" /></label>}<label className="text-xs font-extrabold text-ink/55">Password (8 numbers minimum)<input className="mt-2 w-full rounded-xl border border-ink/10 px-3 py-3 text-sm" type="password" inputMode="numeric" autoComplete="new-password" required minLength="8" maxLength="72" pattern="[0-9]{8,72}" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value.replace(/\D/gu, '') })} /></label><button className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-extrabold text-white disabled:opacity-50" disabled={busy === 'create'} type="submit"><UserPlus size={16} />{busy === 'create' ? 'Creating…' : `Add ${role}`}</button></form></section>
    <section className="overflow-hidden rounded-3xl bg-white soft-shadow"><div className="flex items-center gap-3 p-5 sm:p-6"><UsersRound className="text-brand" size={21} /><div><h2 className="text-xl font-extrabold">Clinic team</h2><p className="text-xs text-ink/45">{state.staff.filter(({ active }) => active).length} active accounts</p></div></div><div className="divide-y divide-ink/5">{state.staff.map((staff) => <article className="flex flex-col gap-4 px-5 py-5 lg:flex-row lg:items-center" key={staff.id}><div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-mint text-brand">{staff.role === 'dentist' ? <Stethoscope size={20} /> : <UsersRound size={20} />}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-extrabold">{staff.displayName}</h3><span className={`rounded-full px-2 py-1 text-[10px] font-extrabold uppercase ${staff.active ? 'bg-mint text-brand' : 'bg-ink/5 text-ink/40'}`}>{staff.active ? 'Active' : 'Inactive'}</span></div><p className="mt-1 text-xs text-ink/45">{titleCase(staff.role)}{staff.specialty ? ` · ${staff.specialty}` : ''} · Added {formatDate(staff.createdAt)} · Last login {staff.lastLoginAt ? formatDate(staff.lastLoginAt) : 'Never'}</p></div><div className="flex flex-wrap gap-2"><button className="inline-flex items-center gap-1.5 rounded-xl bg-cream px-3 py-2 text-xs font-extrabold text-ink/60" disabled={Boolean(busy)} onClick={() => act(staff, 'password')}><KeyRound size={14} /> Reset password</button><button className="inline-flex items-center gap-1.5 rounded-xl bg-cream px-3 py-2 text-xs font-extrabold text-ink/60" disabled={Boolean(busy)} onClick={() => act(staff, 'sessions')}><LogOut size={14} /> Revoke sessions</button><button className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-extrabold ${staff.active ? 'bg-[#fff0e7] text-[#914b22]' : 'bg-mint text-brand'}`} disabled={Boolean(busy) || staff.role === 'super_admin'} onClick={() => act(staff, 'status')}><ShieldOff size={14} /> {staff.active ? 'Deactivate' : 'Reactivate'}</button></div></article>)}</div></section>
  </>
}
