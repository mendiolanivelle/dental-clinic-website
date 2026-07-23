import { Phone, ShieldCheck } from 'lucide-react'
import BrandLogo from './BrandLogo'
import ClinicPhoneLink, { clinicPhoneDisplay } from './ClinicPhoneLink'

export default function AuthLayout({ children, title, description }) {
  return (
    <main className="grid min-h-screen bg-cream lg:grid-cols-[minmax(340px,.85fr)_1.15fr]">
      <section className="relative hidden overflow-hidden bg-brand p-12 text-white lg:flex lg:flex-col">
        <div className="absolute -right-28 -top-20 h-80 w-80 rounded-full border-[50px] border-white/8" />
        <div className="absolute -bottom-40 -left-28 h-96 w-96 rounded-full bg-white/5" />
        <BrandLogo light />
        <div className="relative my-auto max-w-lg">
          <span className="mb-6 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-xs font-bold">
            <ShieldCheck size={16} />
            Private patient portal
          </span>
          <h2 className="text-4xl font-extrabold leading-tight xl:text-5xl">
            Your smile journey, all in one calm place.
          </h2>
          <p className="mt-5 max-w-md leading-7 text-white/70">
            Review your appointments, dentist-published records, and current care plan securely.
          </p>
        </div>
        <ClinicPhoneLink className="relative inline-flex items-center gap-2 text-sm font-bold text-white/80 hover:text-white">
          <Phone size={17} />
          Need help? {clinicPhoneDisplay}
        </ClinicPhoneLink>
      </section>

      <section className="flex min-h-screen items-center justify-center px-5 py-8 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-10 lg:hidden">
            <BrandLogo />
          </div>
          <p className="text-xs font-extrabold uppercase tracking-[.2em] text-brand/60">Patient access</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h1>
          <p className="mt-3 text-sm leading-6 text-ink/55">{description}</p>
          <div className="mt-8 rounded-[30px] bg-white p-6 soft-shadow sm:p-8">
            {children}
          </div>
          <p className="mt-6 text-center text-xs leading-5 text-ink/45">
            This portal is for clinic-provisioned patients. Your information is never stored in this browser.
          </p>
        </div>
      </section>
    </main>
  )
}
