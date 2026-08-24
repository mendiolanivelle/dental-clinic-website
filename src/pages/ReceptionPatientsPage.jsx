import { useState } from 'react'
import { Check, Copy, IdCard, Phone, Search, UserPlus, UsersRound } from 'lucide-react'
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

  async function search(event) {
    event.preventDefault()
    if (query.trim().length < 2) {
      setError('Enter at least two letters or numbers.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const data = await api.searchReceptionPatients(query.trim())
      setPatients(data.patients || [])
      setSearched(true)
      setCreatedPatient(null)
      setShowCreate(false)
    } catch (requestError) {
      setError(requestError.message || 'The patient search could not be completed.')
    } finally {
      setLoading(false)
    }
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
      setPatients([data.patient])
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

  return <>
    <div className="mb-8">
      <p className="text-xs font-extrabold uppercase tracking-[.18em] text-brand/60">Directory</p>
      <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Find a patient</h1>
      <p className="mt-2 text-sm text-ink/50">Search by patient name or patient ID. Clinical records are not shown here.</p>
    </div>
    <form className="flex flex-col gap-3 rounded-3xl bg-white p-5 soft-shadow sm:flex-row" onSubmit={search}>
      <div className="relative flex-1">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-ink/30" size={18} />
        <input className="input-field" type="search" placeholder="Name or patient ID" value={query} onChange={(event) => setQuery(event.target.value)} />
      </div>
      <button className="rounded-2xl bg-brand px-6 py-3 text-sm font-extrabold text-white hover:bg-brand-dark disabled:opacity-60" disabled={loading} type="submit">{loading ? 'Searching…' : 'Search'}</button>
    </form>
    {error && <p className="mt-4 rounded-2xl bg-[#fff0e7] p-4 text-sm text-[#914b22]" role="alert">{error}</p>}
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
              <option value="non_binary">Non-binary</option>
              <option value="prefer_not_to_say">Prefer not to say</option>
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
    <div className="mt-6">
      {searched && !patients.length ? <EmptyState
        icon={UsersRound}
        title="No patient found"
        message="Check the spelling or create a new patient account for this person."
        action={<button className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-xs font-extrabold text-white hover:bg-brand-dark" type="button" onClick={() => { setCreateName(query.trim()); setShowCreate(true); setError('') }}><UserPlus size={15} /> Create patient account</button>}
      /> : (
        <div className="grid gap-4 md:grid-cols-2">
          {patients.map((patient) => (
            <article className="rounded-3xl bg-white p-5 soft-shadow" key={patient.id}>
              <h2 className="text-lg font-extrabold">{patient.displayName}</h2>
              <p className="mt-3 flex items-center gap-2 text-sm text-ink/55"><IdCard className="text-brand" size={16} />{patient.patientNumber}</p>
              <p className="mt-2 flex items-center gap-2 text-sm text-ink/55"><Phone className="text-brand" size={16} />{patient.phone}</p>
              {patient.age !== null && <p className="mt-2 text-sm text-ink/55">Age {patient.age} · {titleCase(patient.gender)}</p>}
            </article>
          ))}
        </div>
      )}
    </div>
  </>
}
