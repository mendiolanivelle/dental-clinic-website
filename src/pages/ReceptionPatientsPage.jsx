import { useState } from 'react'
import { IdCard, Phone, Search, UsersRound } from 'lucide-react'
import { api } from '../api'
import { EmptyState } from '../components/PageState'

export default function ReceptionPatientsPage() {
  const [query, setQuery] = useState('')
  const [patients, setPatients] = useState([])
  const [searched, setSearched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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
    } catch (requestError) {
      setError(requestError.message || 'The patient search could not be completed.')
    } finally {
      setLoading(false)
    }
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
    <div className="mt-6">
      {searched && !patients.length ? <EmptyState icon={UsersRound} title="No patient found" message="Check the spelling or patient ID and try again." /> : (
        <div className="grid gap-4 md:grid-cols-2">
          {patients.map((patient) => (
            <article className="rounded-3xl bg-white p-5 soft-shadow" key={patient.id}>
              <h2 className="text-lg font-extrabold">{patient.displayName}</h2>
              <p className="mt-3 flex items-center gap-2 text-sm text-ink/55"><IdCard className="text-brand" size={16} />{patient.patientNumber}</p>
              <p className="mt-2 flex items-center gap-2 text-sm text-ink/55"><Phone className="text-brand" size={16} />{patient.phone}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  </>
}
