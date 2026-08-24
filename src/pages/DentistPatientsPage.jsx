import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, IdCard, Search, UsersRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { EmptyState } from '../components/PageState'
import { titleCase } from '../format'

export default function DentistPatientsPage() {
  const [query, setQuery] = useState('')
  const [patients, setPatients] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async (value = '') => {
    setLoading(true)
    setError('')
    try {
      const data = await api.searchDentistPatients(value)
      setPatients(data.patients || [])
    } catch (requestError) {
      setError(requestError.message || 'Patients could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { load() }, [load])

  return <>
    <div className="mb-8">
      <p className="text-xs font-extrabold uppercase tracking-[.18em] text-brand/60">Clinical directory</p>
      <h1 className="mt-2 text-3xl font-extrabold tracking-tight">My patients</h1>
      <p className="mt-2 text-sm text-ink/50">Patients assigned to you through appointments or clinical history.</p>
    </div>
    <form className="flex flex-col gap-3 rounded-3xl bg-white p-5 soft-shadow sm:flex-row" onSubmit={(event) => { event.preventDefault(); load(query.trim()) }}>
      <div className="relative flex-1">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-ink/30" size={18} />
        <input className="input-field" type="search" placeholder="Patient name or ID" value={query} onChange={(event) => setQuery(event.target.value)} />
      </div>
      <button className="rounded-2xl bg-brand px-6 py-3 text-sm font-extrabold text-white disabled:opacity-60" disabled={loading} type="submit">{loading ? 'Searching…' : 'Search'}</button>
    </form>
    {error && <p className="mt-4 rounded-2xl bg-[#fff0e7] p-4 text-sm text-[#914b22]" role="alert">{error}</p>}
    <div className="mt-6">
      {!loading && patients.length ? <div className="grid gap-4 md:grid-cols-2">
        {patients.map((patient) => {
          const hasAlert = Boolean(patient.allergies || patient.medicalConditions || patient.currentMedications)
          return <Link className="rounded-3xl bg-white p-5 soft-shadow transition hover:-translate-y-0.5 hover:ring-2 hover:ring-brand/15" key={patient.id} to={`/dentist/patients/${patient.id}`}>
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-extrabold">{patient.displayName}</h2>
              {hasAlert && <AlertTriangle className="text-[#a45b2a]" size={18} />}
            </div>
            <p className="mt-3 flex items-center gap-2 text-sm text-ink/55"><IdCard className="text-brand" size={16} />{patient.patientNumber}</p>
            <p className="mt-2 text-sm text-ink/55">Age {patient.age ?? 'not recorded'} · {titleCase(patient.gender || 'not recorded')}</p>
            <p className="mt-4 text-xs font-extrabold text-brand">Open patient workspace</p>
          </Link>
        })}
      </div> : !loading && <EmptyState icon={UsersRound} title="No patient found" message="Only patients assigned to this dentist are available here." />}
    </div>
  </>
}
