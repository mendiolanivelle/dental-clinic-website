import { useOutletContext } from 'react-router-dom'
import { IdCard, LockKeyhole, Phone, ShieldCheck, UserRound } from 'lucide-react'
import ClinicPhoneLink, { clinicPhoneDisplay } from '../components/ClinicPhoneLink'

export default function ProfilePage() {
  const { patient } = useOutletContext()
  const name = patient?.displayName || patient?.display_name || patient?.name || 'Patient'
  const patientNumber = patient?.patientNumber || patient?.patient_number || 'Not available'

  return (
    <>
      <section className="mb-8">
        <p className="text-xs font-extrabold uppercase tracking-[.18em] text-brand/60">Account</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">Profile</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-ink/50">
          Review the identifying information connected to this secure portal session.
        </p>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_.75fr]">
        <section className="rounded-3xl bg-white p-6 soft-shadow sm:p-8">
          <div className="flex items-center gap-4 border-b border-ink/8 pb-6">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-mint text-brand">
              <UserRound size={25} />
            </div>
            <div>
              <p className="text-xs font-bold text-ink/40">Patient profile</p>
              <h2 className="mt-1 text-xl font-extrabold">{name}</h2>
            </div>
          </div>

          <dl className="mt-6 space-y-4">
            <div className="rounded-2xl bg-cream/70 p-4">
              <dt className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[.14em] text-ink/40">
                <UserRound size={14} />
                Full name as recorded by the clinic
              </dt>
              <dd className="mt-2 text-sm font-extrabold">{name}</dd>
            </div>
            <div className="rounded-2xl bg-cream/70 p-4">
              <dt className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[.14em] text-ink/40">
                <IdCard size={14} />
                Patient ID
              </dt>
              <dd className="mt-2 font-mono text-sm font-bold tracking-wide">{patientNumber}</dd>
            </div>
          </dl>

          <p className="mt-5 text-xs leading-5 text-ink/45">
            To correct your name, mobile number, or other patient information, visit or call the clinic. Profile changes are not available online.
          </p>
        </section>

        <aside className="space-y-5">
          <section className="rounded-3xl bg-brand p-6 text-white">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/12">
              <ShieldCheck size={21} />
            </div>
            <h2 className="mt-5 text-lg font-extrabold">Your session is protected</h2>
            <p className="mt-2 text-xs leading-5 text-white/70">
              Access expires automatically after inactivity. Always log out when using a shared device.
            </p>
            <div className="mt-4 flex items-center gap-2 rounded-2xl bg-white/10 p-3 text-xs font-bold">
              <LockKeyhole size={16} />
              No portal password is stored
            </div>
          </section>

          <section className="rounded-3xl bg-[#f4dfc9] p-6">
            <h2 className="text-lg font-extrabold">Need to update your details?</h2>
            <p className="mt-2 text-xs leading-5 text-ink/55">
              Our care team will verify your identity before changing patient information.
            </p>
            <ClinicPhoneLink className="mt-5 inline-flex items-center gap-2 text-sm font-extrabold text-[#915020]">
              <Phone size={15} />
              {clinicPhoneDisplay}
            </ClinicPhoneLink>
          </section>
        </aside>
      </div>
    </>
  )
}
