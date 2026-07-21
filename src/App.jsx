import { useState } from 'react'
import {
  Activity, Bell, CalendarDays, ChevronRight, CircleHelp, Clock3,
  CreditCard, FileText, HeartPulse, LayoutDashboard, Menu, MessageCircle,
  Phone, Search, Settings, ShieldCheck, Sparkles, Stethoscope, UserRound,
  UsersRound, X,
} from 'lucide-react'

const nav = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'Appointments', icon: CalendarDays, count: 4 },
  { label: 'Our Dentists', icon: Stethoscope },
  { label: 'Treatments', icon: Sparkles },
  { label: 'My Records', icon: FileText },
  { label: 'Messages', icon: MessageCircle, count: 2 },
  { label: 'Billing', icon: CreditCard },
]

const services = [
  { icon: Sparkles, title: 'Teeth whitening', text: 'A brighter smile in one relaxed visit.', color: 'bg-[#dff3ef] text-brand' },
  { icon: ShieldCheck, title: 'Dental implants', text: 'Natural-looking, lasting tooth replacement.', color: 'bg-[#fdecd9] text-[#bd6b22]' },
  { icon: HeartPulse, title: 'General care', text: 'Checkups, cleaning, fillings, and prevention.', color: 'bg-[#e9e7f8] text-[#7061a8]' },
]

const appointments = [
  { date: '24', month: 'JUL', time: '10:30 AM', title: 'Routine Checkup', doctor: 'Dr. Maya Reyes', color: 'bg-brand' },
  { date: '02', month: 'AUG', time: '2:00 PM', title: 'Teeth Cleaning', doctor: 'Dr. Liam Chen', color: 'bg-[#df8a48]' },
]

function Logo() {
  return <div className="flex items-center gap-3">
    <div className="grid h-11 w-11 place-items-center rounded-2xl bg-brand text-white shadow-lg shadow-teal-900/15">
      <Sparkles size={22} strokeWidth={2.4} />
    </div>
    <div><p className="text-xl font-extrabold tracking-tight text-ink">SmileCare</p><p className="text-[10px] font-bold uppercase tracking-[.24em] text-brand/70">Dental Clinic</p></div>
  </div>
}

function Sidebar({ open, setOpen }) {
  const [active, setActive] = useState('Overview')
  return <>
    {open && <button aria-label="Close navigation" className="fixed inset-0 z-30 bg-ink/35 backdrop-blur-sm lg:hidden" onClick={() => setOpen(false)} />}
    <aside className={`sidebar-shadow fixed inset-y-0 left-0 z-40 flex w-[285px] flex-col bg-white px-5 py-7 transition-transform duration-300 lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="mb-8 flex items-center justify-between px-2"><Logo /><button aria-label="Close navigation" className="rounded-xl p-2 text-ink/60 hover:bg-mint lg:hidden" onClick={() => setOpen(false)}><X size={20} /></button></div>
      <p className="mb-3 px-4 text-[10px] font-extrabold uppercase tracking-[.2em] text-ink/35">Patient menu</p>
      <nav className="space-y-1" aria-label="Main navigation">
        {nav.map(({ label, icon: Icon, count }) => <button key={label} onClick={() => { setActive(label); setOpen(false) }} className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition ${active === label ? 'bg-brand text-white shadow-lg shadow-teal-900/15' : 'text-ink/60 hover:bg-mint/70 hover:text-brand'}`}>
          <Icon size={19} /><span className="flex-1 text-left">{label}</span>{count && <span className={`grid h-6 min-w-6 place-items-center rounded-lg px-1.5 text-[11px] ${active === label ? 'bg-white/20 text-white' : 'bg-[#fde5d4] text-[#b96026]'}`}>{count}</span>}
        </button>)}
      </nav>
      <div className="mt-auto">
        <div className="mb-5 rounded-3xl bg-cream p-4">
          <div className="mb-3 grid h-9 w-9 place-items-center rounded-xl bg-white text-brand"><CircleHelp size={18} /></div>
          <p className="text-sm font-bold">Need some help?</p><p className="mt-1 text-xs leading-5 text-ink/50">Our care team is ready to answer your questions.</p>
          <button className="mt-3 text-xs font-extrabold text-brand">Contact support →</button>
        </div>
        <button className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-ink/55 hover:bg-mint"><Settings size={19} /> Settings</button>
      </div>
    </aside>
  </>
}

function Header({ setOpen }) {
  return <header className="flex items-center gap-3 py-6 lg:py-8">
    <button aria-label="Open navigation" className="rounded-2xl bg-white p-3 text-ink shadow-sm lg:hidden" onClick={() => setOpen(true)}><Menu size={21} /></button>
    <div className="relative hidden max-w-md flex-1 md:block"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-ink/30" size={18} /><input aria-label="Search" className="w-full rounded-2xl border border-white bg-white/80 py-3.5 pl-11 pr-4 text-sm outline-none placeholder:text-ink/30 focus:ring-2 focus:ring-brand/15" placeholder="Search treatments, dentists..." /></div>
    <div className="ml-auto flex items-center gap-3">
      <button aria-label="Notifications" className="relative rounded-2xl bg-white p-3 text-ink/60 shadow-sm"><Bell size={20} /><span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full border-2 border-white bg-[#e77a57]" /></button>
      <div className="flex items-center gap-3 rounded-2xl bg-white py-1.5 pl-1.5 pr-3 shadow-sm">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#fde5d4] text-sm font-extrabold text-[#a85825]">AN</div>
        <div className="hidden sm:block"><p className="text-xs font-extrabold">Alex Navarro</p><p className="text-[10px] text-ink/40">Patient</p></div>
      </div>
    </div>
  </header>
}

function App() {
  const [open, setOpen] = useState(false)
  return <div className="min-h-screen bg-cream">
    <Sidebar open={open} setOpen={setOpen} />
    <main className="min-h-screen lg:ml-[285px]">
      <div className="mx-auto max-w-[1500px] px-5 pb-10 sm:px-8 lg:px-10 xl:px-14">
        <Header setOpen={setOpen} />
        <section className="mb-7"><p className="mb-1 text-sm font-semibold text-brand">Tuesday, July 21</p><h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Good morning, Alex <span aria-hidden="true">👋</span></h1><p className="mt-2 text-sm text-ink/50">Here’s everything you need for a healthier, happier smile.</p></section>

        <section className="soft-shadow relative mb-8 overflow-hidden rounded-[32px] bg-brand px-6 py-8 text-white sm:px-9 sm:py-10">
          <div className="absolute -right-16 -top-24 h-72 w-72 rounded-full border-[42px] border-white/8" /><div className="absolute bottom-[-90px] right-[18%] h-48 w-48 rounded-full bg-[#89c8bb]/20" />
          <div className="relative z-10 max-w-xl"><span className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/12 px-3 py-1.5 text-xs font-bold"><Activity size={14} /> Your smile, our priority</span><h2 className="text-3xl font-extrabold leading-tight sm:text-4xl">Confident smiles start<br className="hidden sm:block" /> with gentle care.</h2><p className="mt-3 max-w-md text-sm leading-6 text-white/70">From routine checkups to complete smile makeovers, our team makes every visit comfortable.</p><div className="mt-6 flex flex-wrap gap-3"><button className="rounded-xl bg-white px-5 py-3 text-sm font-extrabold text-brand transition hover:bg-mint">Book appointment</button><button className="rounded-xl border border-white/25 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/10">Explore services</button></div></div>
          <div className="absolute bottom-0 right-6 hidden h-[90%] w-[31%] items-end justify-center xl:flex"><div className="relative grid aspect-square w-full max-w-[300px] place-items-center rounded-full bg-[#d7eee8]"><div className="grid h-[82%] w-[82%] place-items-center rounded-full border border-white/50 bg-white/20"><Stethoscope className="text-brand/70" size={105} strokeWidth={1.2} /></div></div></div>
        </section>

        <div className="grid gap-7 xl:grid-cols-[1.45fr_.85fr]">
          <div className="space-y-7">
            <section><div className="mb-4 flex items-end justify-between"><div><p className="text-xs font-extrabold uppercase tracking-[.18em] text-brand/60">Feel your best</p><h2 className="mt-1 text-xl font-extrabold">Popular treatments</h2></div><button className="flex items-center gap-1 text-xs font-extrabold text-brand">View all <ChevronRight size={15} /></button></div>
              <div className="grid gap-4 md:grid-cols-3">{services.map(({ icon: Icon, title, text, color }) => <article key={title} className="card-hover rounded-3xl bg-white p-5"><div className={`mb-5 grid h-12 w-12 place-items-center rounded-2xl ${color}`}><Icon size={22} /></div><h3 className="text-sm font-extrabold">{title}</h3><p className="mt-2 text-xs leading-5 text-ink/45">{text}</p><button aria-label={`Learn about ${title}`} className="mt-4 grid h-8 w-8 place-items-center rounded-xl bg-cream text-brand"><ChevronRight size={16} /></button></article>)}</div>
            </section>
            <section className="rounded-3xl bg-white p-5 sm:p-6"><div className="mb-5 flex items-center justify-between"><div><p className="text-xs font-extrabold uppercase tracking-[.18em] text-brand/60">Next visits</p><h2 className="mt-1 text-xl font-extrabold">Upcoming appointments</h2></div><button className="rounded-xl bg-mint px-3 py-2 text-xs font-extrabold text-brand">+ New booking</button></div>
              <div className="space-y-3">{appointments.map(a => <article key={a.date} className="flex flex-col gap-4 rounded-2xl border border-ink/6 p-3 sm:flex-row sm:items-center"><div className={`${a.color} flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl text-white`}><b className="text-xl leading-none">{a.date}</b><span className="mt-1 text-[9px] font-extrabold tracking-widest">{a.month}</span></div><div className="min-w-0 flex-1"><div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold text-ink/40"><Clock3 size={12} /> {a.time}</div><h3 className="text-sm font-extrabold">{a.title}</h3><p className="mt-1 text-xs text-ink/45">with {a.doctor}</p></div><button className="self-start rounded-xl border border-ink/8 px-3 py-2 text-xs font-bold text-ink/60 sm:self-auto">Details</button></article>)}</div>
            </section>
          </div>

          <aside className="space-y-5">
            <section className="rounded-3xl bg-white p-6"><div className="mb-5 flex items-center justify-between"><div><p className="text-xs font-extrabold uppercase tracking-[.18em] text-brand/60">Care profile</p><h2 className="mt-1 text-lg font-extrabold">Smile health</h2></div><div className="grid h-10 w-10 place-items-center rounded-2xl bg-mint text-brand"><UserRound size={19} /></div></div><div className="mb-5 flex items-center gap-5"><div className="relative grid h-24 w-24 place-items-center rounded-full" style={{ background: 'conic-gradient(#176b68 0 82%, #e8efec 82% 100%)' }}><div className="grid h-[76px] w-[76px] place-items-center rounded-full bg-white"><div className="text-center"><b className="text-2xl">82%</b><p className="text-[9px] text-ink/40">Healthy</p></div></div></div><div><p className="text-sm font-extrabold">Looking great!</p><p className="mt-1 text-xs leading-5 text-ink/45">Keep brushing twice daily and stay on schedule.</p></div></div><div className="grid grid-cols-2 gap-3"><div className="rounded-2xl bg-cream p-3"><p className="text-[10px] font-bold text-ink/40">Last cleaning</p><p className="mt-1 text-xs font-extrabold">May 18, 2026</p></div><div className="rounded-2xl bg-cream p-3"><p className="text-[10px] font-bold text-ink/40">Next due</p><p className="mt-1 text-xs font-extrabold">Nov 18, 2026</p></div></div></section>
            <section className="rounded-3xl bg-[#f4dfc9] p-6"><div className="mb-4 grid h-10 w-10 place-items-center rounded-2xl bg-white/70 text-[#a65c26]"><Phone size={18} /></div><h2 className="text-lg font-extrabold">Dental emergency?</h2><p className="mt-2 text-xs leading-5 text-ink/55">We offer same-day urgent appointments. Call our care team now.</p><a href="tel:+63281234567" className="mt-5 inline-flex items-center gap-2 text-sm font-extrabold text-[#915020]"><Phone size={15} /> (02) 8123 4567</a></section>
            <section className="flex items-center gap-4 rounded-3xl bg-white p-5"><div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-mint text-brand"><UsersRound size={21} /></div><div className="flex-1"><p className="text-sm font-extrabold">Refer a friend</p><p className="mt-1 text-xs text-ink/45">You both get 10% off cleaning.</p></div><ChevronRight className="text-brand" size={18} /></section>
          </aside>
        </div>
      </div>
    </main>
  </div>
}

export default App
