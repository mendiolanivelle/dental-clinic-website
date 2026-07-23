const rawPhone = (import.meta.env.VITE_CLINIC_PHONE_TEL || '').trim()

if (rawPhone && !/^\+?[0-9().\s-]{7,25}$/.test(rawPhone)) {
  throw new Error('VITE_CLINIC_PHONE_TEL is not a valid telephone number')
}

const phoneHref = rawPhone
  ? `tel:${rawPhone.replace(/[^\d+]/g, '')}`
  : ''

export const clinicPhoneDisplay =
  (import.meta.env.VITE_CLINIC_PHONE_DISPLAY || '').trim() ||
  rawPhone ||
  'Contact the clinic'

export default function ClinicPhoneLink({ children, ...props }) {
  if (!phoneHref) return <span {...props}>{children || clinicPhoneDisplay}</span>
  return <a {...props} href={phoneHref}>{children || clinicPhoneDisplay}</a>
}
