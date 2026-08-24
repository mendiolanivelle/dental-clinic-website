import { useCallback, useEffect, useState } from 'react'
import { Check, Copy, IdCard, Pencil, Phone, Search, UserPlus, UsersRound } from 'lucide-react'
import { api } from '../api'
import { EmptyState } from '../components/PageState'
import { titleCase } from '../format'

export default function ReceptionPatientsPage() {
  const [query, setQuery] = useState('')
  const [patients, setPatients] = useState([])
  const [searched, setSearched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createPhone, setCreatePhone] = useState('')
  const [createAge, setCreateAge] = useState('')
  const [createGender, setCreateGender] = useState('')
  const [creating, setCreating] = useState(false)
  const [createdPatient, setCreatedPatient] = useState(null)
  const [copied, setCopied] = useState(false)
  const [editingPatient, setEditingPatient] = useState(null)
  const [editForm, setEditForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [savedMessage, setSavedMessage] = useState('')

  const loadPatients = useCallback(async (searchQuery = '') => {
    setLoading(true)
    setError('')
    try {
      const data = await api.searchReceptionPatients(searchQuery)
      setPatients(data.patients || [])
      setSearched(true)
      setCreatedPatient(null)
      setShowCreate(false)
    } catch (requestError) {
      setError(requestError.message || 'The patient search could not be completed.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadPatients() }, [loadPatients])

  async function search(event) {
    event.preventDefault()
    await loadPatients(query.trim())
  }

  async function createPatient(event) {
    event.preventDefault()
    setCreating(true)
    setError('')
    try {
      const data = await api.createReceptionPatient({
        displayName: createName.trim(),
        phone: createPhone.trim(),
        age: Number(createAge),
        gender: createGender,
      })
      setCreatedPatient(data.patient)
      setPatients((current) => [...current.filter(({ id }) => id !== data.patient.id), data.patient]
        .sort((a, b) => a.displayName.localeCompare(b.displayName)))
      setSearched(true)
      setShowCreate(false)
      setQuery(data.patient.displayName)
    } catch (requestError) {
      setError(requestError.message || 'The patient account could not be created.')
    } finally {
      setCreating(false)
    }
  }

  async function copyPatientId() {
    if (!createdPatient?.patientNumber) return
    await navigator.clipboard?.writeText(createdPatient.patientNumber)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  function startEditing(patient) {
    setEditingPatient(patient)
    setEditForm({
      displayName: patient.displayName,
      phone: patient.phone || '',
      age: String(patient.age ?? ''),
      gender: patient.gender || '',
      weightKg: String(patient.weightKg ?? ''),
      bloodPressureSystolic: String(patient.bloodPressureSystolic ?? ''),
      bloodPressureDiastolic: String(patient.bloodPressureDiastolic ?? ''),
    })
    setError('')
    setSavedMessage('')
  }

  async function savePatient(event) {
    event.preventDefault()
    const optionalNumber = (value) => value === '' ? null : Number(value)
    setSaving(true)
    setError('')
    try {
      const data = await api.updateReceptionPatient(editingPatient.id, {
        displayName: editForm.displayName.trim(),
        phone: editForm.phone.trim(),
        age: Number(editForm.age),
        gender: editForm.gender,
        weightKg: optionalNumber(editForm.weightKg),
        bloodPressureSystolic: optionalNumber(editForm.bloodPressureSystolic),
        bloodPressureDiastolic: optionalNumber(editForm.bloodPressureDiastolic),
      })
      setPatients((current) => current.map((patient) => patient.id === data.patient.id ? data.patient : patient)
        .sort((a, b) => a.displayName.localeCompare(b.displayName)))
      setEditingPatient(null)
      setEditForm(null)
      setSavedMessage(`${data.patient.displayName}’s information was updated.`)
    } catch (requestError) {
      setError(requestError.message || 'The patient information could not be updated.')
    } finally {
      setSaving(false)
    }
  }

  return <>
    <div className="mb-8">
      <p className="text-xs font-extrabold uppercase tracking-[.18em] text-brand/60">Directory</p>
      <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Registered patients</h1>
      <p className="mt-2 text-sm text-ink/50">All registered patients are listed below. Search by name or patient ID to narrow the list.</p>
    </div>
    <form className="flex flex-col gap-3 rounded-3xl bg-white p-5 soft-shadow sm:flex-row" onSubmit={search}>
      <div className="relative flex-1">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-ink/30" size={18} />
        <input className="input-field" type="search" placeholder="Name or patient ID" value={query} onChange={(event) => setQuery(event.target.value)} />
      </div>
      <button className="rounded-2xl bg-brand px-6 py-3 text-sm font-extrabold text-white hover:bg-brand-dark disabled:opacity-60" disabled={loading} type="submit">{loading ? 'Searching…' : 'Search'}</button>
    </form>
    {error && <p className="mt-4 rounded-2xl bg-[#fff0e7] p-4 text-sm text-[#914b22]" role="alert">{error}</p>}
    {savedMessage && <p className="mt-4 rounded-2xl bg-mint p-4 text-sm font-bold text-brand" role="status">{savedMessage}</p>}
    {showCreate && (
      <form className="mt-6 rounded-3xl border border-brand/15 bg-mint/55 p-5 sm:p-6" onSubmit={createPatient}>
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white text-brand"><UserPlus size={20} /></div>
          <div>
            <h2 className="font-extrabold">Create patient account</h2>
            <p className="mt-1 text-sm leading-6 text-ink/55">A five-digit patient ID will be assigned automatically after you save this patient.</p>
          </div>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <label className="mb-2 block text-sm font-extrabold" htmlFor="new-patient-name">Full name</label>
            <input id="new-patient-name" className="input-field" value={createName} onChange={(event) => setCreateName(event.target.value)} placeholder="First Middle Last" required />
          </div>
          <div>
            <label className="mb-2 block text-sm font-extrabold" htmlFor="new-patient-phone">Phone <span className="font-normal text-ink/40">(optional)</span></label>
            <input id="new-patient-phone" className="input-field" type="tel" value={createPhone} onChange={(event) => setCreatePhone(event.target.value)} placeholder="+63 9XX XXX XXXX" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-extrabold" htmlFor="new-patient-age">Age</label>
            <input id="new-patient-age" className="input-field" type="number" min="0" max="130" value={createAge} onChange={(event) => setCreateAge(event.target.value)} required />
          </div>
          <div>
            <label className="mb-2 block text-sm font-extrabold" htmlFor="new-patient-gender">Gender</label>
            <select id="new-patient-gender" className="input-field" value={createGender} onChange={(event) => setCreateGender(event.target.value)} required>
              <option value="">Choose</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
            </select>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <button className="rounded-xl bg-brand px-4 py-2.5 text-xs font-extrabold text-white hover:bg-brand-dark disabled:opacity-60" type="submit" disabled={creating}>{creating ? 'Creating…' : 'Create account'}</button>
          <button className="rounded-xl px-4 py-2.5 text-xs font-extrabold text-ink/55 hover:bg-white" type="button" onClick={() => setShowCreate(false)}>Cancel</button>
        </div>
      </form>
    )}
    {createdPatient && (
      <div className="mt-6 flex flex-col gap-4 rounded-3xl border border-brand/20 bg-white p-5 soft-shadow sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[.16em] text-brand/60">Patient account created</p>
          <h2 className="mt-1 text-lg font-extrabold">Give this ID to {createdPatient.displayName.split(' ')[0]}</h2>
          <p className="mt-1 text-sm text-ink/50">They will use it with their full name to open the patient portal.</p>
          <p className="mt-2 text-xs font-bold text-ink/40">Age {createdPatient.age} · {titleCase(createdPatient.gender)}</p>
        </div>
        <button className="inline-flex items-center justify-center gap-2 rounded-2xl bg-brand px-4 py-3 text-sm font-extrabold text-white hover:bg-brand-dark" type="button" onClick={copyPatientId}>
          {copied ? <Check size={16} /> : <Copy size={16} />}
          {copied ? 'Copied' : createdPatient.patientNumber}
        </button>
      </div>
    )}
    {editingPatient && editForm && (
      <form className="mt-6 rounded-3xl border border-brand/15 bg-white p-5 soft-shadow sm:p-6" onSubmit={savePatient}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="text-xs font-extrabold uppercase tracking-[.16em] text-brand/60">Edit patient · {editingPatient.patientNumber}</p><h2 className="mt-1 text-lg font-extrabold">Patient information</h2></div>
          <button className="rounded-xl px-3 py-2 text-xs font-extrabold text-ink/50 hover:bg-cream" type="button" onClick={() => { setEditingPatient(null); setEditForm(null) }}>Cancel</button>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <label className="text-sm font-extrabold">Full name<input className="input-field mt-2" required value={editForm.displayName} onChange={(event) => setEditForm({ ...editForm, displayName: event.target.value })} /></label>
          <label className="text-sm font-extrabold">Phone <span className="font-normal text-ink/40">(optional)</span><input className="input-field mt-2" type="tel" value={editForm.phone} onChange={(event) => setEditForm({ ...editForm, phone: event.target.value })} /></label>
          <label className="text-sm font-extrabold">Age<input className="input-field mt-2" type="number" min="0" max="130" required value={editForm.age} onChange={(event) => setEditForm({ ...editForm, age: event.target.value })} /></label>
          <label className="text-sm font-extrabold">Gender<select className="input-field mt-2" required value={editForm.gender} onChange={(event) => setEditForm({ ...editForm, gender: event.target.value })}><option value="">Choose</option><option value="female">Female</option><option value="male">Male</option><option value="non_binary">Non-binary</option><option value="prefer_not_to_say">Prefer not to say</option></select></label>
          <label className="text-sm font-extrabold">Weight (kg) <span className="font-normal text-ink/40">(optional)</span><input className="input-field mt-2" type="number" min="1" max="500" step="0.1" value={editForm.weightKg} onChange={(event) => setEditForm({ ...editForm, weightKg: event.target.value })} /></label>
          <label className="text-sm font-extrabold">Blood pressure systolic <span className="font-normal text-ink/40">(optional)</span><input className="input-field mt-2" type="number" min="50" max="300" placeholder="120" value={editForm.bloodPressureSystolic} onChange={(event) => setEditForm({ ...editForm, bloodPressureSystolic: event.target.value })} /></label>
          <label className="text-sm font-extrabold">Blood pressure diastolic <span className="font-normal text-ink/40">(optional)</span><input className="input-field mt-2" type="number" min="30" max="200" placeholder="80" value={editForm.bloodPressureDiastolic} onChange={(event) => setEditForm({ ...editForm, bloodPressureDiastolic: event.target.value })} /></label>
        </div>
        <p className="mt-3 text-xs text-ink/40">Enter both blood pressure values together, for example 120/80 mmHg.</p>
        <button className="mt-5 rounded-xl bg-brand px-5 py-3 text-sm font-extrabold text-white hover:bg-brand-dark disabled:opacity-60" disabled={saving} type="submit">{saving ? 'Saving…' : 'Save patient information'}</button>
      </form>
    )}
    <div className="mt-6">
      {!loading && patients.length > 0 && <p className="mb-3 text-xs font-extrabold uppercase tracking-[.14em] text-ink/40">{patients.length} patient{patients.length === 1 ? '' : 's'}</p>}
      {loading ? <p className="rounded-3xl bg-white p-8 text-center text-sm font-semibold text-ink/45">Loading patients…</p> :
      searched && !patients.length ? <EmptyState
        icon={UsersRound}
        title="No patient found"
        message="Check the spelling or create a new patient account for this person."
        action={<button className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-xs font-extrabold text-white hover:bg-brand-dark" type="button" onClick={() => { setCreateName(query.trim()); setShowCreate(true); setError('') }}><UserPlus size={15} /> Create patient account</button>}
      /> : (
        <div className="grid gap-4 md:grid-cols-2">
          {patients.map((patient) => (
            <button className="group rounded-3xl bg-white p-5 text-left soft-shadow transition hover:-translate-y-0.5 hover:ring-2 hover:ring-brand/15" key={patient.id} type="button" onClick={() => startEditing(patient)}>
              <div className="flex items-start justify-between gap-3"><h2 className="text-lg font-extrabold group-hover:text-brand">{patient.displayName}</h2><Pencil className="text-brand/45 group-hover:text-brand" size={17} /></div>
              <p className="mt-3 flex items-center gap-2 text-sm text-ink/55"><IdCard className="text-brand" size={16} />{patient.patientNumber}</p>
              <p className="mt-2 flex items-center gap-2 text-sm text-ink/55"><Phone className="text-brand" size={16} />{patient.phone || 'No phone recorded'}</p>
              {patient.age !== null && <p className="mt-2 text-sm text-ink/55">Age {patient.age} · {titleCase(patient.gender)}</p>}
              <p className="mt-2 text-sm text-ink/55">Weight {patient.weightKg === null || patient.weightKg === undefined ? 'Not recorded' : `${patient.weightKg} kg`} · BP {patient.bloodPressureSystolic && patient.bloodPressureDiastolic ? `${patient.bloodPressureSystolic}/${patient.bloodPressureDiastolic} mmHg` : 'Not recorded'}</p>
              <p className="mt-3 text-xs font-extrabold text-brand/55">Click to edit information</p>
            </button>
          ))}
        </div>
      )}
    </div>
  </>
}
