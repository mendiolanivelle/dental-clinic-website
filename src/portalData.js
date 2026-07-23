export function patientFrom(payload) {
  return payload?.patient || payload?.me || payload?.data?.patient || payload?.data || payload || {}
}

export function listFrom(payload, key) {
  if (Array.isArray(payload)) return payload
  const value = payload?.[key] ?? payload?.data?.[key] ?? payload?.data
  return Array.isArray(value) ? value : []
}

export function planFrom(payload) {
  if (!payload) return null
  if ('treatmentPlan' in payload) return payload.treatmentPlan
  if ('plan' in payload) return payload.plan
  if (payload.data && 'treatmentPlan' in payload.data) return payload.data.treatmentPlan
  return payload.data || payload
}

export function appointmentView(appointment = {}) {
  const type = appointment.appointmentType || appointment.appointment_type
  const dentist = appointment.dentist

  return {
    ...appointment,
    id: appointment.id,
    title: type?.name || appointment.typeName || appointment.appointmentTypeName || appointment.appointment_type_name || appointment.type || 'Dental appointment',
    startsAt: appointment.startsAt || appointment.starts_at || appointment.start,
    endsAt: appointment.endsAt || appointment.ends_at || appointment.end,
    dentistName: dentist?.displayName || dentist?.display_name || appointment.dentistName || appointment.dentist_name || 'Your dentist',
    status: appointment.status || 'scheduled',
    instructions: appointment.patientInstructions || appointment.patient_instructions || '',
  }
}

export function recordView(record = {}) {
  const dentist = record.dentist

  return {
    ...record,
    id: record.id,
    procedureName: record.procedureName || record.procedure_name || 'Dental treatment',
    treatedOn: record.treatedOn || record.treated_on,
    summary: record.patientSummary || record.patient_summary || '',
    dentistName: dentist?.displayName || dentist?.display_name || record.dentistName || record.dentist_name || 'Your dentist',
  }
}

export function treatmentPlanView(plan) {
  if (!plan) return null
  return {
    ...plan,
    title: plan.title || 'Current treatment plan',
    summary: plan.patientSummary || plan.patient_summary || '',
    status: plan.status || 'active',
    startedOn: plan.startedOn || plan.started_on,
    intervalDays: plan.recommendedIntervalDays || plan.recommended_interval_days,
    nextRecommendedOn: plan.nextRecommendedOn || plan.next_recommended_on,
  }
}
