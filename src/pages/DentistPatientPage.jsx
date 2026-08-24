import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  CalendarPlus,
  FileClock,
  ImageUp,
  Pill,
  ShieldAlert,
  Stethoscope,
} from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api'
import { EmptyState, ErrorState, LoadingState } from '../components/PageState'
import { formatDate, formatDateTime, titleCase } from '../format'

const todayInManila = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Manila',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date())

const fileBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result).split(',')[1] || '')
  reader.onerror = () => reject(new Error('The selected image could not be read.'))
  reader.readAsDataURL(file)
})

export default function DentistPatientPage() {
  const { id } = useParams()
  const [state, setState] = useState({ loading: true, chart: null, error: null })
  const [message, setMessage] = useState('')
  const [actionError, setActionError] = useState('')
  const [prescription, setPrescription] = useState({ prescribedOn: todayInManila(), genericName: '', instructions: '', file: null })
  const [followUp, setFollowUp] = useState({ recommendedOn: '', appointmentTypeId: '', notes: '' })
  const [savingPrescription, setSavingPrescription] = useState(false)
  const [savingFollowUp, setSavingFollowUp] = useState(false)

  const load = useCallback(() => {
    setState({ loading: true, chart: null, error: null })
    api.getDentistPatient(id)
      .then((chart) => setState({ loading: false, chart, error: null }))
      .catch((error) => setState({ loading: false, chart: null, error }))
  }, [id])
  useEffect(load, [load])

  async function uploadPrescription(event) {
    event.preventDefault()
    const file = prescription.file
    if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setActionError('Choose a JPEG, PNG, or WebP prescription image up to 5 MB.')
      return
    }
    setSavingPrescription(true)
    setActionError('')
    setMessage('')
    try {
      await api.uploadDentistPrescription(id, {
        prescribedOn: prescription.prescribedOn,
        genericName: prescription.genericName.trim(),
        instructions: prescription.instructions.trim(),
        imageMimeType: file.type,
        imageOriginalName: file.name,
        imageBase64: await fileBase64(file),
      })
      setPrescription({ prescribedOn: todayInManila(), genericName: '', instructions: '', file: null })
      setMessage('Prescription image and medication details saved.')
      load()
    } catch (error) {
      setActionError(error.message || 'The prescription could not be saved.')
    } finally {
      setSavingPrescription(false)
    }
  }

  async function saveFollowUp(event) {
    event.preventDefault()
    setSavingFollowUp(true)
    setActionError('')
    setMessage('')
    try {
      await api.createDentistFollowUp(id, {
        recommendedOn: followUp.recommendedOn,
        appointmentTypeId: followUp.appointmentTypeId || null,
        notes: followUp.notes.trim(),
      })
      setFollowUp({ recommendedOn: '', appointmentTypeId: '', notes: '' })
      setMessage('Next-visit recommendation saved for scheduling.')
      load()
    } catch (error) {
      setActionError(error.message || 'The next visit could not be saved.')
    } finally {
      setSavingFollowUp(false)
    }
  }

  if (state.loading) return <LoadingState label="Opening patient workspace…" />
  if (state.error) return <ErrorState error={state.error} onRetry={load} />

  const { patient, appointments = [], records = [], treatmentPlans = [], prescriptions = [], followUps = [], services = [] } = state.chart
  const medicalAlerts = [
    ['Allergies', patient.allergies],
    ['Medical conditions', patient.medicalConditions],
    ['Current medications', patient.currentMedications],
  ]

  return <>
    <Link className="mb-5 inline-flex items-center gap-2 text-sm font-extrabold text-brand" to="/dentist/patients"><ArrowLeft size={16} /> Back to patients</Link>

    <section className="rounded-[30px] bg-brand p-6 text-white soft-shadow sm:p-8">
      <p className="text-xs font-extrabold uppercase tracking-[.18em] text-white/60">Patient workspace</p>
      <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">{patient.displayName}</h1>
          <p className="mt-2 text-sm text-white/70">Patient ID {patient.patientNumber} · Age {patient.age ?? 'not recorded'} · {titleCase(patient.gender || 'not recorded')}</p>
        </div>
        <div className="rounded-2xl bg-white/10 px-4 py-3 text-xs font-bold">
          BP {patient.bloodPressureSystolic && patient.bloodPressureDiastolic ? `${patient.bloodPressureSystolic}/${patient.bloodPressureDiastolic} mmHg` : 'not recorded'} · Weight {patient.weightKg ? `${patient.weightKg} kg` : 'not recorded'}
        </div>
      </div>
    </section>

    <section className="mt-5 grid gap-3 md:grid-cols-3" aria-label="Medical safety information">
      {medicalAlerts.map(([label, value]) => <article className={`rounded-2xl p-4 ${value ? 'bg-[#fff0e7] text-[#783e1c]' : 'bg-white text-ink/55'}`} key={label}>
        <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[.12em]">{value ? <ShieldAlert size={15} /> : <AlertTriangle size={15} />}{label}</p>
        <p className="mt-2 whitespace-pre-line text-sm leading-6">{value || 'Not recorded'}</p>
      </article>)}
    </section>
    <p className="mt-3 text-xs text-ink/40">Medical history last reviewed: {formatDate(patient.medicalHistoryReviewedAt)}</p>

    {message && <p className="mt-5 rounded-2xl bg-mint p-4 text-sm font-bold text-brand" role="status">{message}</p>}
    {actionError && <p className="mt-5 rounded-2xl bg-[#fff0e7] p-4 text-sm text-[#914b22]" role="alert">{actionError}</p>}

    <div className="mt-7 grid gap-6 xl:grid-cols-[1.35fr_.8fr]">
      <div className="space-y-6">
        <section className="rounded-3xl bg-white p-5 soft-shadow sm:p-6">
          <div className="flex items-center gap-3"><FileClock className="text-brand" size={21} /><h2 className="text-xl font-extrabold">Treatment history</h2></div>
          {records.length ? <div className="mt-5 divide-y divide-ink/8">
            {records.map((record) => <article className="py-4 first:pt-0" key={record.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div><h3 className="font-extrabold">{record.procedureName}</h3><p className="mt-1 text-xs text-ink/45">{record.dentistName}</p></div>
                <p className="text-xs font-bold text-brand">{formatDate(record.treatedOn)}</p>
              </div>
              <p className="mt-3 whitespace-pre-line text-sm leading-6 text-ink/60">{record.patientSummary}</p>
            </article>)}
          </div> : <div className="mt-5"><EmptyState icon={Stethoscope} title="No treatment records" message="Completed clinical records will appear here." /></div>}
        </section>

        <section className="rounded-3xl bg-white p-5 soft-shadow sm:p-6">
          <div className="flex items-center gap-3"><CalendarPlus className="text-brand" size={21} /><h2 className="text-xl font-extrabold">Appointments & care plans</h2></div>
          {!!treatmentPlans.length && <div className="mt-5 space-y-3">{treatmentPlans.map((plan) => <article className="rounded-2xl bg-mint/45 p-4" key={plan.id}><div className="flex flex-wrap justify-between gap-2"><p className="font-extrabold">{plan.title}</p><span className="text-xs font-bold uppercase text-brand">{titleCase(plan.status)}</span></div><p className="mt-2 text-sm leading-6 text-ink/55">{plan.patientSummary}</p><p className="mt-2 text-xs font-bold text-brand">Next recommended: {formatDate(plan.nextRecommendedOn)}</p></article>)}</div>}
          {appointments.length ? <div className="mt-5 divide-y divide-ink/8">{appointments.map((appointment) => <div className="flex flex-col gap-1 py-3 first:pt-0 sm:flex-row sm:justify-between" key={appointment.id}><div><p className="font-bold">{appointment.typeName}</p><p className="text-xs text-ink/45">{appointment.dentistName}</p></div><p className="text-xs font-bold text-brand">{formatDateTime(appointment.startsAt)} · {titleCase(appointment.status)}</p></div>)}</div> : <p className="mt-5 text-sm text-ink/45">No appointments recorded.</p>}
        </section>

        <section className="rounded-3xl bg-white p-5 soft-shadow sm:p-6">
          <div className="flex items-center gap-3"><Pill className="text-brand" size={21} /><h2 className="text-xl font-extrabold">Prescription records</h2></div>
          {prescriptions.length ? <div className="mt-5 grid gap-4 sm:grid-cols-2">{prescriptions.map((item) => <article className="overflow-hidden rounded-2xl border border-ink/8" key={item.id}>
            <a href={`/api/dentist/prescriptions/${item.id}/image`} target="_blank" rel="noreferrer"><img alt={`Written prescription for ${item.genericName}`} className="h-44 w-full bg-cream object-contain" src={`/api/dentist/prescriptions/${item.id}/image`} /></a>
            <div className="p-4"><h3 className="font-extrabold">{item.genericName}</h3><p className="mt-2 whitespace-pre-line text-sm leading-6 text-ink/60">{item.instructions}</p><p className="mt-3 text-xs font-bold text-ink/40">{formatDate(item.prescribedOn)} · {item.dentistName}</p></div>
          </article>)}</div> : <p className="mt-5 text-sm text-ink/45">No prescription images uploaded.</p>}
        </section>
      </div>

      <aside className="space-y-6">
        <form className="rounded-3xl bg-white p-5 soft-shadow sm:p-6" onSubmit={uploadPrescription}>
          <div className="flex items-center gap-3"><ImageUp className="text-brand" size={21} /><h2 className="text-lg font-extrabold">Upload written prescription</h2></div>
          <p className="mt-2 text-xs leading-5 text-ink/45">Stored as a private clinical record copy.</p>
          <label className="mt-5 block text-sm font-extrabold">Prescription date<input className="input-field mt-2" max={todayInManila()} required type="date" value={prescription.prescribedOn} onChange={(event) => setPrescription({ ...prescription, prescribedOn: event.target.value })} /></label>
          <label className="mt-4 block text-sm font-extrabold">Generic medication name<input className="input-field mt-2" maxLength="240" required value={prescription.genericName} onChange={(event) => setPrescription({ ...prescription, genericName: event.target.value })} /></label>
          <label className="mt-4 block text-sm font-extrabold">Directions<textarea className="input-field mt-2 min-h-28" maxLength="2000" required value={prescription.instructions} onChange={(event) => setPrescription({ ...prescription, instructions: event.target.value })} /></label>
          <label className="mt-4 block text-sm font-extrabold">Prescription image<input accept="image/jpeg,image/png,image/webp" className="mt-2 block w-full text-xs text-ink/55" required type="file" onChange={(event) => setPrescription({ ...prescription, file: event.target.files?.[0] || null })} /></label>
          <button className="mt-5 w-full rounded-xl bg-brand px-5 py-3 text-sm font-extrabold text-white disabled:opacity-60" disabled={savingPrescription} type="submit">{savingPrescription ? 'Uploading…' : 'Save prescription'}</button>
        </form>

        <form className="rounded-3xl bg-white p-5 soft-shadow sm:p-6" onSubmit={saveFollowUp}>
          <div className="flex items-center gap-3"><CalendarPlus className="text-brand" size={21} /><h2 className="text-lg font-extrabold">Plan next visit</h2></div>
          <p className="mt-2 text-xs leading-5 text-ink/45">This creates a recommendation for scheduling, not a confirmed appointment.</p>
          <label className="mt-5 block text-sm font-extrabold">Recommended date<input className="input-field mt-2" min={todayInManila()} required type="date" value={followUp.recommendedOn} onChange={(event) => setFollowUp({ ...followUp, recommendedOn: event.target.value })} /></label>
          <label className="mt-4 block text-sm font-extrabold">Service<select className="input-field mt-2" value={followUp.appointmentTypeId} onChange={(event) => setFollowUp({ ...followUp, appointmentTypeId: event.target.value })}><option value="">To be decided</option>{services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select></label>
          <label className="mt-4 block text-sm font-extrabold">Clinical note<textarea className="input-field mt-2 min-h-24" maxLength="1000" value={followUp.notes} onChange={(event) => setFollowUp({ ...followUp, notes: event.target.value })} /></label>
          <button className="mt-5 w-full rounded-xl bg-brand px-5 py-3 text-sm font-extrabold text-white disabled:opacity-60" disabled={savingFollowUp} type="submit">{savingFollowUp ? 'Saving…' : 'Save recommendation'}</button>
          {!!followUps.length && <div className="mt-5 border-t border-ink/8 pt-4"><p className="text-xs font-extrabold uppercase tracking-[.12em] text-ink/40">Recent recommendations</p>{followUps.slice(0, 4).map((item) => <div className="mt-3 rounded-xl bg-cream p-3" key={item.id}><p className="text-sm font-extrabold">{item.serviceName || 'Follow-up visit'}</p><p className="mt-1 text-xs text-ink/50">{formatDate(item.recommendedOn)} · {titleCase(item.status)}</p>{item.notes && <p className="mt-2 text-xs leading-5 text-ink/55">{item.notes}</p>}</div>)}</div>}
        </form>
      </aside>
    </div>
  </>
}
