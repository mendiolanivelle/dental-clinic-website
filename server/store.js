const appointmentFromRow = (row) => ({
  id: row.id,
  typeName: row.type_name,
  startsAt: row.starts_at,
  endsAt: row.ends_at,
  status: row.status,
  dentistName: row.dentist_name,
  patientInstructions: row.patient_instructions,
})

const recordFromRow = (row) => ({
  id: row.id,
  procedureName: row.procedure_name,
  treatedOn: row.treated_on,
  patientSummary: row.patient_summary,
  dentistName: row.dentist_name,
})

const treatmentPlanFromRow = (row) => ({
  id: row.id,
  title: row.title,
  patientSummary: row.patient_summary,
  status: row.status,
  startedOn: row.started_on,
  recommendedIntervalDays: row.recommended_interval_days,
  nextRecommendedOn: row.next_recommended_on,
})

const serviceFromRow = (row) => ({
  id: row.id,
  name: row.name,
  durationMinutes: row.default_duration_minutes,
  patientDescription: row.patient_description,
})

const appointmentRequestFromRow = (row) => ({
  id: row.id,
  serviceId: row.appointment_type_id,
  serviceName: row.service_name,
  preferredDate: row.preferred_date,
  timePreference: row.time_preference,
  patientNote: row.patient_note,
  status: row.status,
  clinicNote: row.status === 'confirmed' || row.status === 'declined' ? row.clinic_note : null,
  createdAt: row.created_at,
})

const appointmentSelect = `
  SELECT a.id, t.name AS type_name, a.starts_at, a.ends_at, a.status,
         d.display_name AS dentist_name, a.patient_instructions
  FROM appointments a
  JOIN appointment_types t ON t.id = a.appointment_type_id
  JOIN dentists d ON d.id = a.dentist_id
`

const recordSelect = `
  SELECT r.id, r.procedure_name, r.treated_on, r.patient_summary,
         d.display_name AS dentist_name
  FROM clinical_records r
  JOIN dentists d ON d.id = r.dentist_id
`

const treatmentPlanSelect = `
  SELECT id, title, patient_summary, status, started_on,
         recommended_interval_days, next_recommended_on
  FROM treatment_plans
`

const appointmentRequestSelect = `
  SELECT r.id, r.appointment_type_id, t.name AS service_name,
         r.preferred_date, r.time_preference, r.patient_note,
         r.status, r.clinic_note, r.created_at
  FROM appointment_requests r
  JOIN appointment_types t ON t.id = r.appointment_type_id
`

export function createStore(db) {
  const addAudit = async ({
    actorType,
    actorId = null,
    action,
    objectType = null,
    objectId = null,
    occurredAt,
    requestId,
    ipDigest,
    userAgent,
  }) => {
    await db.query(
      `INSERT INTO audit_events (
         actor_type, actor_id, action, object_type, object_id, occurred_at,
         request_id, ip_digest, user_agent
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        actorType,
        actorId,
        action,
        objectType,
        objectId,
        occurredAt,
        requestId,
        ipDigest,
        userAgent?.slice(0, 512) || null,
      ],
    )
  }

  const listAppointments = async (patientId, scope, now) => {
    const upcoming = scope === 'upcoming'
    const result = await db.query(
      `${appointmentSelect}
       WHERE a.patient_id = $1
         AND a.starts_at ${upcoming ? '>=' : '<'} $2
       ORDER BY a.starts_at ${upcoming ? 'ASC' : 'DESC'}`,
      [patientId, now],
    )
    return result.rows.map(appointmentFromRow)
  }

  const listRecords = async (patientId) => {
    const result = await db.query(
      `${recordSelect}
       WHERE r.patient_id = $1
         AND r.published_at IS NOT NULL
       ORDER BY r.treated_on DESC, r.created_at DESC`,
      [patientId],
    )
    return result.rows.map(recordFromRow)
  }

  const getTreatmentPlan = async (patientId) => {
    const result = await db.query(
      `${treatmentPlanSelect}
       WHERE patient_id = $1
         AND published_at IS NOT NULL
         AND status = 'active'
       ORDER BY updated_at DESC
       LIMIT 1`,
      [patientId],
    )
    return result.rowCount ? treatmentPlanFromRow(result.rows[0]) : null
  }

  const listServices = async () => {
    const result = await db.query(
      `SELECT id, name, default_duration_minutes, patient_description
       FROM appointment_types
       ORDER BY name ASC`,
    )
    return result.rows.map(serviceFromRow)
  }

  const listAppointmentRequests = async (patientId) => {
    const result = await db.query(
      `${appointmentRequestSelect}
       WHERE r.patient_id = $1
       ORDER BY r.created_at DESC
       LIMIT 20`,
      [patientId],
    )
    return result.rows.map(appointmentRequestFromRow)
  }

  return {
    async health() {
      await db.query('SELECT 1')
    },

    async createSessionForLogin({
      normalizedName,
      patientNumber,
      sessionId,
      tokenDigest,
      now,
      absoluteExpiresAt,
      audit,
    }) {
      return db.transaction(async (client) => {
        const result = await client.query(
          `SELECT id, display_name, patient_number
           FROM patients
           WHERE normalized_name = $1
             AND patient_number = $2
             AND portal_enabled = true
           LIMIT 1`,
          [normalizedName, patientNumber],
        )
        const row = result.rows[0]

        if (row) {
          await client.query(
            `INSERT INTO portal_sessions (
               id, patient_id, token_digest, created_at, last_seen_at,
               absolute_expires_at
             ) VALUES ($1, $2, $3, $4, $4, $5)`,
            [sessionId, row.id, tokenDigest, now, absoluteExpiresAt],
          )
        }
        await client.query(
          `INSERT INTO audit_events (
             actor_type, actor_id, action, occurred_at, request_id, ip_digest, user_agent
           ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            row ? 'patient' : 'anonymous',
            row?.id || null,
            row ? 'portal.login_succeeded' : 'portal.login_failed',
            now,
            audit.requestId,
            audit.ipDigest,
            audit.userAgent?.slice(0, 512) || null,
          ],
        )
        return row
          ? {
              id: row.id,
              displayName: row.display_name,
              patientNumber: row.patient_number,
            }
          : null
      })
    },

    async authenticateSession(tokenDigest, now, idleCutoff) {
      const result = await db.query(
        `UPDATE portal_sessions s
         SET last_seen_at = $2
         FROM patients p
         WHERE s.token_digest = $1
           AND s.patient_id = p.id
           AND s.revoked_at IS NULL
           AND s.absolute_expires_at > $2
           AND s.last_seen_at >= $3
           AND p.portal_enabled = true
         RETURNING s.id AS session_id, p.id, p.display_name, p.patient_number`,
        [tokenDigest, now, idleCutoff],
      )
      const row = result.rows[0]
      return row
        ? {
            sessionId: row.session_id,
            id: row.id,
            displayName: row.display_name,
            patientNumber: row.patient_number,
          }
        : null
    },

    async revokeSession(tokenDigest, now) {
      await db.query(
        `UPDATE portal_sessions
         SET revoked_at = $2
         WHERE token_digest = $1 AND revoked_at IS NULL`,
        [tokenDigest, now],
      )
    },

    addAudit,
    listServices,
    listAppointmentRequests,
    listAppointments,
    listRecords,
    getTreatmentPlan,

    async createAppointmentRequest({
      patientId,
      appointmentTypeId,
      preferredDate,
      timePreference,
      patientNote,
      now,
    }) {
      const result = await db.query(
        `WITH inserted AS (
           INSERT INTO appointment_requests (
             patient_id, appointment_type_id, preferred_date,
             time_preference, patient_note, status, created_at, updated_at
           )
           SELECT $1, t.id, $3, $4, $5, 'requested', $6, $6
           FROM appointment_types t
           WHERE t.id = $2
           RETURNING id, appointment_type_id, preferred_date, time_preference,
                     patient_note, status, clinic_note, created_at
         )
         SELECT inserted.*, t.name AS service_name
         FROM inserted
         JOIN appointment_types t ON t.id = inserted.appointment_type_id`,
        [patientId, appointmentTypeId, preferredDate, timePreference, patientNote, now],
      )
      return result.rowCount ? appointmentRequestFromRow(result.rows[0]) : null
    },

    async getAppointment(patientId, appointmentId) {
      const result = await db.query(
        `${appointmentSelect}
         WHERE a.id = $1 AND a.patient_id = $2`,
        [appointmentId, patientId],
      )
      return result.rowCount ? appointmentFromRow(result.rows[0]) : null
    },

    async getRecord(patientId, recordId) {
      const result = await db.query(
        `${recordSelect}
         WHERE r.id = $1
           AND r.patient_id = $2
           AND r.published_at IS NOT NULL`,
        [recordId, patientId],
      )
      return result.rowCount ? recordFromRow(result.rows[0]) : null
    },

    async getDashboard(patientId, now) {
      const [appointmentResult, plan, recordResult, services] = await Promise.all([
        db.query(
          `${appointmentSelect}
           WHERE a.patient_id = $1
             AND a.starts_at >= $2
             AND a.status IN ('scheduled', 'confirmed')
           ORDER BY a.starts_at ASC
           LIMIT 1`,
          [patientId, now],
        ),
        getTreatmentPlan(patientId),
        db.query(
          `${recordSelect}
           WHERE r.patient_id = $1
             AND r.published_at IS NOT NULL
           ORDER BY r.treated_on DESC, r.created_at DESC
           LIMIT 1`,
          [patientId],
        ),
        listServices(),
      ])
      return {
        nextAppointment: appointmentResult.rowCount
          ? appointmentFromRow(appointmentResult.rows[0])
          : null,
        treatmentPlan: plan,
        recentRecord: recordResult.rowCount ? recordFromRow(recordResult.rows[0]) : null,
        services,
      }
    },
  }
}
