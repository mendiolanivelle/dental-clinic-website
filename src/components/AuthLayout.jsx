import { ArrowRight, Phone, ShieldCheck, Sparkles } from 'lucide-react'
import BrandLogo from './BrandLogo'
import ClinicPhoneLink, { clinicPhoneDisplay } from './ClinicPhoneLink'

const servicesButtonClass = 'services-cta relative inline-flex items-center gap-2 rounded-xl bg-mint px-4 py-2.5 text-xs font-extrabold text-brand shadow-lg shadow-black/10 transition hover:bg-white'

export default function AuthLayout({ children, servicesContent, title, description, accessLabel = 'Patient access', footer, onServicesClick, servicesActive }) {
  return (
    <main className="grid min-h-screen bg-cream lg:h-screen lg:grid-cols-[minmax(340px,.85fr)_1.15fr] lg:overflow-hidden">
      <section className="relative hidden overflow-hidden bg-brand p-8 text-white lg:flex lg:flex-col xl:p-12">
        <div className="absolute -right-28 -top-20 h-80 w-80 rounded-full border-[50px] border-white/8" />
        <div className="absolute -bottom-40 -left-28 h-96 w-96 rounded-full bg-white/5" />
        <BrandLogo light />
        <button
          className={`${servicesButtonClass} mt-6 w-fit`}
          type="button"
          onClick={onServicesClick}
          aria-controls="dental-services-panel"
          aria-expanded={servicesActive}
          aria-pressed={servicesActive}
        >
          <Sparkles size={17} />
          {servicesActive ? 'Back to login' : 'View dental services'}
          <ArrowRight size={16} />
        </button>
        <div className="relative my-auto grid w-full max-w-xl">
          <div className={`col-start-1 row-start-1 self-center transition-all duration-500 ${servicesActive ? 'pointer-events-none -translate-x-5 opacity-0' : 'translate-x-0 opacity-100'}`}>
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
          <div
            className={`col-start-1 row-start-1 self-center transition-all duration-500 ${servicesActive ? 'max-h-[calc(100vh-190px)] overflow-y-auto overscroll-contain pr-1 translate-x-0 opacity-100' : 'pointer-events-none translate-x-5 opacity-0'}`}
            id="dental-services-panel"
            aria-hidden={!servicesActive}
          >
            {servicesContent}
          </div>
        </div>
        <ClinicPhoneLink className="relative inline-flex items-center gap-2 text-sm font-bold text-white/80 hover:text-white">
          <Phone size={17} />
          Need help? {clinicPhoneDisplay}
        </ClinicPhoneLink>
      </section>

      <section className="flex min-h-screen items-center justify-center px-5 py-8 sm:px-8 lg:min-h-0 lg:overflow-y-auto lg:px-10 lg:py-5 xl:px-12">
        <div className="w-full max-w-md">
          <div className="mb-10 lg:hidden">
            <BrandLogo />
          </div>
          <p className="text-xs font-extrabold uppercase tracking-[.2em] text-brand/60">{accessLabel}</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h1>
          <p className="mt-3 text-sm leading-6 text-ink/55">{description}</p>
          <button
            className={`${servicesButtonClass} mt-5 lg:hidden`}
            type="button"
            onClick={onServicesClick}
            aria-controls="mobile-dental-services-panel"
            aria-expanded={servicesActive}
            aria-pressed={servicesActive}
          >
            <Sparkles size={15} />
            {servicesActive ? 'Back to login' : 'View dental services'}
            <ArrowRight size={15} />
          </button>
          <div className="mt-8 rounded-[30px] bg-white p-6 soft-shadow sm:p-8 lg:mt-4 lg:p-5">
            {servicesActive && (
              <div className="mb-8 border-b border-ink/8 pb-8 lg:hidden" id="mobile-dental-services-panel">
                {servicesContent}
              </div>
            )}
            {children}
          </div>
          <p className="mt-6 text-center text-xs leading-5 text-ink/45 lg:mt-4">
            {footer || 'This portal is for clinic-provisioned patients. Your information is never stored in this browser.'}
          </p>
        </div>
      </section>
    </main>
  )
}
