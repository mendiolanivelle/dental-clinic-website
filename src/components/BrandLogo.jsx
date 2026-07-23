import { Sparkles } from 'lucide-react'

export default function BrandLogo({ light = false }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`grid h-11 w-11 place-items-center rounded-2xl shadow-lg ${
        light ? 'bg-white text-brand shadow-black/10' : 'bg-brand text-white shadow-teal-900/15'
      }`}>
        <Sparkles size={22} strokeWidth={2.4} />
      </div>
      <div>
        <p className={`text-xl font-extrabold tracking-tight ${light ? 'text-white' : 'text-ink'}`}>
          SmileCare
        </p>
        <p className={`text-[10px] font-bold uppercase tracking-[.24em] ${
          light ? 'text-white/65' : 'text-brand/70'
        }`}>
          Dental Clinic
        </p>
      </div>
    </div>
  )
}
