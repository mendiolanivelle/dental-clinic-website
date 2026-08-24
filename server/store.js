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
  dentistId: row.dentist_id,
  dentistName: row.dentist_name,
  requestedStartAt: row.requested_start_at,
  requestedEndAt: row.requested_end_at,
  preferredDate: row.preferred_date,
  timePreference: row.time_preference,
  patientNote: row.patient_note,
  status: row.status,
  clinicNote: row.status === 'confirmed' || row.status === 'declined' ? row.clinic_note : null,
  createdAt: row.created_at,
})

const availabilitySlotFromRow = (row) => ({
  dentistId: row.dentist_id,
  dentistName: row.dentist_name,
  startsAt: row.starts_at,
  endsAt: row.ends_at,
  available: row.available,
})

const staffFromRow = (row) => ({
  id: row.id,
  displayName: row.display_name,
  email: row.email,
  role: row.role,
})

const receptionRequestFromRow = (row) => ({
  ...appointmentRequestFromRow(row),
  patient: {
    id: row.patient_id,
    displayName: row.patient_name,
    patientNumber: row.patient_number,
    phone: row.phone_e164,
  },
  clinicNote: row.clinic_note,
})

const receptionAppointmentFromRow = (row) => ({
  id: row.id,
  typeName: row.type_name,
  startsAt: row.starts_at,
  endsAt: row.ends_at,
  status: row.status,
  dentistName: row.dentist_name,
  patient: {
    id: row.patient_id,
    displayName: row.patient_name,
    patientNumber: row.patient_number,
    phone: row.phone_e164,
  },
})

const chargesFromRows = (rows, includeVoided = true) => {
  const charges = new Map()
  for (const row of rows) {
    if (!charges.has(row.charge_id)) {
      charges.set(row.charge_id, {
        id: row.charge_id,
        recordNumber: String(row.payment_record_number),
        appointmentId: row.appointment_id,
        description: row.description,
        subtotalCents: row.subtotal_cents,
        discountCents: row.discount_cents,
        totalCents: row.total_cents,
        status: row.charge_status,
        invoiceReference: row.invoice_reference,
        createdAt: row.charge_created_at,
        appointmentStartsAt: row.appointment_starts_at,
        dentistName: row.dentist_name,
        patient: {
          id: row.patient_id,
          displayName: row.patient_name,
          patientNumber: row.patient_number,
        },
        payments: [],
      })
    }
    if (row.payment_id && (includeVoided || row.payment_status === 'posted')) {
      charges.get(row.charge_id).payments.push({
        id: row.payment_id,
        amountCents: row.payment_amount_cents,
        method: row.payment_method,
        reference: row.external_reference,
        status: row.payment_status,
        receivedAt: row.received_at,
        voidReason: row.void_reason,
      })
    }
  }
  return [...charges.values()].map((charge) => {
    const paidCents = charge.payments
      .filter(({ status }) => status === 'posted')
      .reduce((total, { amountCents }) => total + amountCents, 0)
    return { ...charge, paidCents, balanceCents: charge.totalCents - paidCents }
  })
}

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
         r.dentist_id, d.display_name AS dentist_name,
         r.requested_start_at, r.requested_end_at,
         r.preferred_date, r.time_preference, r.patient_note,
         r.status, r.clinic_note, r.created_at
  FROM appointment_requests r
  JOIN appointment_types t ON t.id = r.appointment_type_id
  LEFT JOIN dentists d ON d.id = r.dentist_id
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

  const listAvailability = async (date, now) => {
    const result = await db.query(
      `WITH slots AS (
         SELECT generate_series(
           (($1::date + time '09:00') AT TIME ZONE 'Asia/Manila'),
           (($1::date + time '16:00') AT TIME ZONE 'Asia/Manila'),
           interval '1 hour'
         ) AS starts_at
         WHERE EXTRACT(ISODOW FROM $1::date) BETWEEN 1 AND 6
       )
       SELECT d.id AS dentist_id, d.display_name AS dentist_name,
              slots.starts_at, slots.starts_at + interval '1 hour' AS ends_at,
              (
                slots.starts_at > $2
                AND NOT EXISTS (
                  SELECT 1
                  FROM appointments a
                  WHERE a.dentist_id = d.id
                    AND a.status IN ('scheduled', 'confirmed')
                    AND a.starts_at < slots.starts_at + interval '1 hour'
                    AND a.ends_at > slots.starts_at
                )
                AND NOT EXISTS (
                  SELECT 1
                  FROM appointment_requests r
                  WHERE r.dentist_id = d.id
                    AND r.status IN ('requested', 'confirmed')
                    AND r.requested_start_at < slots.starts_at + interval '1 hour'
                    AND r.requested_end_at > slots.starts_at
                )
              ) AS available
       FROM dentists d
       CROSS JOIN slots
       WHERE d.active = true
       ORDER BY slots.starts_at ASC, d.display_name ASC`,
      [date, now],
    )
    return result.rows.map(availabilitySlotFromRow)
  }

  const loadCharges = async (queryable, whereSql, values, includeVoided = true) => {
    const result = await queryable.query(
      `SELECT c.id AS charge_id, c.payment_record_number, c.appointment_id,
              c.description, c.subtotal_cents, c.discount_cents, c.total_cents,
              c.status AS charge_status, c.invoice_reference,
              c.created_at AS charge_created_at,
              a.starts_at AS appointment_starts_at, d.display_name AS dentist_name,
              p.id AS patient_id, p.display_name AS patient_name, p.patient_number,
              pay.id AS payment_id, pay.amount_cents AS payment_amount_cents,
              pay.method AS payment_method, pay.external_reference,
              pay.status AS payment_status, pay.received_at, pay.void_reason
       FROM patient_charges c
       JOIN appointments a ON a.id = c.appointment_id
       JOIN dentists d ON d.id = a.dentist_id
       JOIN patients p ON p.id = c.patient_id
       LEFT JOIN patient_payments pay ON pay.charge_id = c.id
       WHERE ${whereSql}
       ORDER BY c.created_at DESC, pay.received_at ASC`,
      values,
    )
    return chargesFromRows(result.rows, includeVoided)
  }

  const updateChargeStatus = async (client, chargeId, now) => {
    await client.query(
      `UPDATE patient_charges c
       SET status = CASE
             WHEN paid.total >= c.total_cents THEN 'paid'
             WHEN paid.total > 0 THEN 'partially_paid'
             ELSE 'unpaid'
           END,
           updated_at = $2
       FROM (
         SELECT coalesce(sum(amount_cents) FILTER (WHERE status = 'posted'), 0)::integer AS total
         FROM patient_payments
         WHERE charge_id = $1
       ) paid
       WHERE c.id = $1`,
      [chargeId, now],
    )
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

    async createStaffSessionForLogin({
      authUserId,
      sessionId,
      tokenDigest,
      now,
      absoluteExpiresAt,
      audit,
    }) {
      return db.transaction(async (client) => {
        const result = await client.query(
          `SELECT id, display_name, email, role
           FROM staff_profiles
           WHERE auth_user_id = $1 AND active = true
           LIMIT 1`,
          [authUserId],
        )
        const row = result.rows[0]
        if (row) {
          await client.query(
            `INSERT INTO staff_sessions (
               id, staff_id, token_digest, created_at, last_seen_at,
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
            row ? 'staff' : 'anonymous',
            row?.id || null,
            row ? 'staff.login_succeeded' : 'staff.login_failed',
            now,
            audit.requestId,
            audit.ipDigest,
            audit.userAgent?.slice(0, 512) || null,
          ],
        )
        return row ? staffFromRow(row) : null
      })
    },

    async authenticateStaffSession(tokenDigest, now, idleCutoff) {
      const result = await db.query(
        `UPDATE staff_sessions s
         SET last_seen_at = $2
         FROM staff_profiles p
         WHERE s.token_digest = $1
           AND s.staff_id = p.id
           AND s.revoked_at IS NULL
           AND s.absolute_expires_at > $2
           AND s.last_seen_at >= $3
           AND p.active = true
         RETURNING p.id, p.display_name, p.email, p.role`,
        [tokenDigest, now, idleCutoff],
      )
      return result.rowCount ? staffFromRow(result.rows[0]) : null
    },

    async revokeStaffSession(tokenDigest, now) {
      await db.query(
        `UPDATE staff_sessions
         SET revoked_at = $2
         WHERE token_digest = $1 AND revoked_at IS NULL`,
        [tokenDigest, now],
      )
    },

    addAudit,
    listServices,
    listAppointmentRequests,
    listAvailability,
    listAppointments,
    listRecords,
    getTreatmentPlan,

    async listPatientBilling(patientId) {
      return loadCharges(db, 'c.patient_id = $1', [patientId], false)
    },

    async getReceptionDashboard(date) {
      const [pending, calendar] = await Promise.all([
        db.query(
          `SELECT count(*)::integer AS count
           FROM appointment_requests
           WHERE status = 'requested'`,
        ),
        this.listReceptionCalendar(date),
      ])
      return {
        pendingRequests: pending.rows[0].count,
        todayAppointments: calendar.appointments,
        todayRequests: calendar.appointmentRequests,
      }
    },

    async listReceptionRequests() {
      const result = await db.query(
        `SELECT r.id, r.appointment_type_id, t.name AS service_name,
                r.dentist_id, d.display_name AS dentist_name,
                r.requested_start_at, r.requested_end_at,
                r.preferred_date, r.time_preference, r.patient_note,
                r.status, r.clinic_note, r.created_at,
                p.display_name AS patient_name, p.patient_number,
                p.phone_e164, p.id AS patient_id
         FROM appointment_requests r
         JOIN appointment_types t ON t.id = r.appointment_type_id
         LEFT JOIN dentists d ON d.id = r.dentist_id
         JOIN patients p ON p.id = r.patient_id
         ORDER BY (r.status = 'requested') DESC, r.created_at DESC
         LIMIT 100`,
      )
      return result.rows.map(receptionRequestFromRow)
    },

    async listReceptionCalendar(date) {
      const [appointments, requests] = await Promise.all([
        db.query(
          `SELECT a.id, t.name AS type_name, a.starts_at, a.ends_at, a.status,
                  d.display_name AS dentist_name, p.id AS patient_id,
                  p.display_name AS patient_name, p.patient_number, p.phone_e164
           FROM appointments a
           JOIN appointment_types t ON t.id = a.appointment_type_id
           JOIN dentists d ON d.id = a.dentist_id
           JOIN patients p ON p.id = a.patient_id
           WHERE (a.starts_at AT TIME ZONE 'Asia/Manila')::date = $1::date
             AND a.status IN ('scheduled', 'confirmed')
           ORDER BY a.starts_at ASC, d.display_name ASC`,
          [date],
        ),
        db.query(
          `SELECT r.id, r.appointment_type_id, t.name AS service_name,
                  r.dentist_id, d.display_name AS dentist_name,
                  r.requested_start_at, r.requested_end_at,
                  r.preferred_date, r.time_preference, r.patient_note,
                  r.status, r.clinic_note, r.created_at,
                  p.display_name AS patient_name, p.patient_number,
                  p.phone_e164, p.id AS patient_id
           FROM appointment_requests r
           JOIN appointment_types t ON t.id = r.appointment_type_id
           LEFT JOIN dentists d ON d.id = r.dentist_id
           JOIN patients p ON p.id = r.patient_id
           WHERE r.preferred_date = $1::date
             AND r.status = 'requested'
           ORDER BY r.requested_start_at ASC, r.created_at ASC`,
          [date],
        ),
      ])
      return {
        appointments: appointments.rows.map(receptionAppointmentFromRow),
        appointmentRequests: requests.rows.map(receptionRequestFromRow),
      }
    },

    async listReceptionBilling(date) {
      const [appointments, charges, totals] = await Promise.all([
        db.query(
          `SELECT a.id, t.name AS type_name, a.starts_at, a.ends_at, a.status,
                  d.display_name AS dentist_name, p.id AS patient_id,
                  p.display_name AS patient_name, p.patient_number, p.phone_e164
           FROM appointments a
           JOIN appointment_types t ON t.id = a.appointment_type_id
           JOIN dentists d ON d.id = a.dentist_id
           JOIN patients p ON p.id = a.patient_id
           LEFT JOIN patient_charges c ON c.appointment_id = a.id
           WHERE a.status IN ('scheduled', 'confirmed')
             AND c.id IS NULL
           ORDER BY a.starts_at ASC
           LIMIT 100`,
        ),
        loadCharges(db, 'true', [], true),
        db.query(
          `SELECT method, coalesce(sum(amount_cents), 0)::integer AS total_cents
           FROM patient_payments
           WHERE status = 'posted'
             AND (received_at AT TIME ZONE 'Asia/Manila')::date = $1::date
           GROUP BY method
           ORDER BY method`,
          [date],
        ),
      ])
      return {
        awaitingCheckout: appointments.rows.map(receptionAppointmentFromRow),
        charges,
        todayPayments: totals.rows.map((row) => ({
          method: row.method,
          totalCents: row.total_cents,
        })),
      }
    },

    async createPatientCheckout({
      appointmentId,
      staffId,
      description,
      subtotalCents,
      discountCents,
      paymentAmountCents,
      paymentMethod,
      paymentReference,
      invoiceReference,
      now,
    }) {
      return db.transaction(async (client) => {
        const selected = await client.query(
          `SELECT id, patient_id
           FROM appointments
           WHERE id = $1 AND status IN ('scheduled', 'confirmed')
           FOR UPDATE`,
          [appointmentId],
        )
        if (!selected.rowCount) return { outcome: 'not_found' }
        const totalCents = subtotalCents - discountCents
        if (totalCents <= 0 || paymentAmountCents > totalCents) {
          return { outcome: 'invalid_amount' }
        }

        let inserted
        try {
          inserted = await client.query(
            `INSERT INTO patient_charges (
               appointment_id, patient_id, description, subtotal_cents,
               discount_cents, total_cents, invoice_reference,
               created_by_staff_id, created_at, updated_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
             RETURNING id`,
            [
              appointmentId,
              selected.rows[0].patient_id,
              description,
              subtotalCents,
              discountCents,
              totalCents,
              invoiceReference,
              staffId,
              now,
            ],
          )
        } catch (error) {
          if (error.code === '23505') return { outcome: 'already_checked_out' }
          throw error
        }
        const chargeId = inserted.rows[0].id
        if (paymentAmountCents > 0) {
          await client.query(
            `INSERT INTO patient_payments (
               charge_id, amount_cents, method, external_reference,
               recorded_by_staff_id, received_at
             ) VALUES ($1, $2, $3, $4, $5, $6)`,
            [chargeId, paymentAmountCents, paymentMethod, paymentReference, staffId, now],
          )
        }
        await updateChargeStatus(client, chargeId, now)
        await client.query(
          `UPDATE appointments SET status = 'completed', updated_at = $2 WHERE id = $1`,
          [appointmentId, now],
        )
        const [charge] = await loadCharges(client, 'c.id = $1', [chargeId], true)
        return { outcome: 'created', charge }
      })
    },

    async addPatientPayment({ chargeId, staffId, amountCents, method, reference, now }) {
      return db.transaction(async (client) => {
        const selected = await client.query(
          `SELECT id, total_cents
           FROM patient_charges
           WHERE id = $1
           FOR UPDATE`,
          [chargeId],
        )
        if (!selected.rowCount) return { outcome: 'not_found' }
        const charge = selected.rows[0]
        const paid = await client.query(
          `SELECT coalesce(sum(amount_cents), 0)::integer AS paid_cents
           FROM patient_payments
           WHERE charge_id = $1 AND status = 'posted'`,
          [chargeId],
        )
        if (amountCents > charge.total_cents - paid.rows[0].paid_cents) {
          return { outcome: 'amount_exceeds_balance' }
        }
        const inserted = await client.query(
          `INSERT INTO patient_payments (
             charge_id, amount_cents, method, external_reference,
             recorded_by_staff_id, received_at
           ) VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
          [chargeId, amountCents, method, reference, staffId, now],
        )
        await updateChargeStatus(client, chargeId, now)
        const [updated] = await loadCharges(client, 'c.id = $1', [chargeId], true)
        return { outcome: 'created', paymentId: inserted.rows[0].id, charge: updated }
      })
    },

    async voidPatientPayment({ paymentId, staffId, reason, now }) {
      return db.transaction(async (client) => {
        const selected = await client.query(
          `SELECT p.charge_id
           FROM patient_payments p
           JOIN patient_charges c ON c.id = p.charge_id
           WHERE p.id = $1 AND p.status = 'posted'
           FOR UPDATE OF c, p`,
          [paymentId],
        )
        if (!selected.rowCount) return { outcome: 'not_found' }
        await client.query(
          `UPDATE patient_payments
           SET status = 'voided', voided_by_staff_id = $2, voided_at = $3, void_reason = $4
           WHERE id = $1 AND status = 'posted'
          `,
          [paymentId, staffId, now, reason],
        )
        const chargeId = selected.rows[0].charge_id
        await updateChargeStatus(client, chargeId, now)
        const [charge] = await loadCharges(client, 'c.id = $1', [chargeId], true)
        return { outcome: 'voided', charge }
      })
    },

    async updateReceptionRequest({ id, action, clinicNote, now }) {
      return db.transaction(async (client) => {
        const selected = await client.query(
          `SELECT r.id, r.patient_id, r.dentist_id, r.appointment_type_id,
                  r.requested_start_at, r.requested_end_at
           FROM appointment_requests r
           WHERE r.id = $1 AND r.status = 'requested'
           FOR UPDATE`,
          [id],
        )
        const request = selected.rows[0]
        if (!request) return { outcome: 'not_found' }

        if (action === 'confirm') {
          const inserted = await client.query(
            `INSERT INTO appointments (
               patient_id, dentist_id, appointment_type_id, starts_at, ends_at,
               status, patient_instructions, created_at, updated_at
             )
             SELECT $1, $2, $3, $4::timestamptz, $5::timestamptz,
                    'confirmed', $6, $7::timestamptz, $7::timestamptz
             WHERE $4::timestamptz > $7::timestamptz
               AND NOT EXISTS (
                 SELECT 1 FROM appointments a
                 WHERE a.dentist_id = $2
                   AND a.status IN ('scheduled', 'confirmed')
                   AND a.starts_at < $5::timestamptz
                   AND a.ends_at > $4::timestamptz
               )
             ON CONFLICT (dentist_id, starts_at)
               WHERE status IN ('scheduled', 'confirmed')
               DO NOTHING
             RETURNING id`,
            [
              request.patient_id,
              request.dentist_id,
              request.appointment_type_id,
              request.requested_start_at,
              request.requested_end_at,
              clinicNote,
              now,
            ],
          )
          if (!inserted.rowCount) return { outcome: 'slot_unavailable' }
        }

        await client.query(
          `UPDATE appointment_requests
           SET status = $2, clinic_note = $3, updated_at = $4
           WHERE id = $1`,
          [id, action === 'confirm' ? 'confirmed' : 'declined', clinicNote, now],
        )
        return { outcome: 'updated' }
      })
    },

    async searchReceptionPatients(query) {
      const result = await db.query(
        `SELECT id, display_name, patient_number, phone_e164, age, gender
         FROM patients
         WHERE (
             position(lower($1) in lower(display_name)) > 0
             OR position(upper($1) in patient_number) > 0
           )
         ORDER BY display_name ASC`,
        [query],
      )
      return result.rows.map((row) => ({
        id: row.id,
        displayName: row.display_name,
        patientNumber: row.patient_number,
        phone: row.phone_e164,
        age: row.age,
        gender: row.gender,
      }))
    },

    async createReceptionPatient({
      displayName,
      normalizedName,
      phoneE164,
      age,
      gender,
      now,
    }) {
      return db.transaction(async (client) => {
        await client.query(`SELECT pg_advisory_xact_lock(hashtext('dental_portal.patient_number'))`)
        const existing = await client.query(
          `SELECT id, display_name, patient_number, phone_e164, age, gender
           FROM patients
           WHERE normalized_name = $1
           LIMIT 1`,
          [normalizedName],
        )
        if (existing.rowCount) return { outcome: 'already_exists' }

        try {
          const nextNumber = await client.query(
            `SELECT lpad((coalesce(max(
               CASE WHEN patient_number ~ '^[0-9]+$' THEN patient_number::bigint END
             ), 0) + 1)::text, 5, '0') AS patient_number
             FROM patients`,
          )
          const patientNumber = nextNumber.rows[0].patient_number
          const result = await client.query(
            `INSERT INTO patients (
               patient_number, display_name, normalized_name, phone_e164,
               phone_verified_at, portal_enabled, age, gender, created_at, updated_at
             ) VALUES ($1, $2, $3, $4, NULL, true, $5, $6, $7, $7)
             RETURNING id, display_name, patient_number, phone_e164, age, gender`,
            [patientNumber, displayName, normalizedName, phoneE164, age, gender, now],
          )
          const row = result.rows[0]
          return {
            outcome: 'created',
            patient: {
              id: row.id,
              displayName: row.display_name,
              patientNumber: row.patient_number,
              phone: row.phone_e164,
              age: row.age,
              gender: row.gender,
            },
          }
        } catch (error) {
          if (error.code === '23505') return { outcome: 'already_exists' }
          throw error
        }
      })
    },

    async createAppointmentRequest({
      patientId,
      appointmentTypeId,
      dentistId,
      startsAt,
      patientNote,
      now,
    }) {
      const result = await db.query(
        `WITH selected AS (
           SELECT t.id AS appointment_type_id, d.id AS dentist_id
           FROM appointment_types t
           CROSS JOIN dentists d
           WHERE t.id = $2
             AND d.id = $3
             AND d.active = true
         ), inserted AS (
           INSERT INTO appointment_requests (
             patient_id, appointment_type_id, dentist_id,
             requested_start_at, requested_end_at, preferred_date,
             time_preference, patient_note, status, created_at, updated_at
           )
           SELECT $1, selected.appointment_type_id, selected.dentist_id,
                  $4::timestamptz, $4::timestamptz + interval '1 hour',
                  ($4::timestamptz AT TIME ZONE 'Asia/Manila')::date,
                  CASE
                    WHEN EXTRACT(HOUR FROM $4::timestamptz AT TIME ZONE 'Asia/Manila') < 12
                    THEN 'morning'
                    ELSE 'afternoon'
                  END,
                  $5, 'requested', $6, $6
           FROM selected
           WHERE $4::timestamptz > $6
             AND EXTRACT(ISODOW FROM $4::timestamptz AT TIME ZONE 'Asia/Manila') BETWEEN 1 AND 6
             AND ($4::timestamptz AT TIME ZONE 'Asia/Manila')::time >= time '09:00'
             AND ($4::timestamptz AT TIME ZONE 'Asia/Manila')::time < time '17:00'
             AND EXTRACT(MINUTE FROM $4::timestamptz AT TIME ZONE 'Asia/Manila') = 0
             AND EXTRACT(SECOND FROM $4::timestamptz AT TIME ZONE 'Asia/Manila') = 0
             AND NOT EXISTS (
               SELECT 1
               FROM appointments a
               WHERE a.dentist_id = selected.dentist_id
                 AND a.status IN ('scheduled', 'confirmed')
                 AND a.starts_at < $4::timestamptz + interval '1 hour'
                 AND a.ends_at > $4::timestamptz
             )
             AND NOT EXISTS (
               SELECT 1
               FROM appointment_requests r
               WHERE r.dentist_id = selected.dentist_id
                 AND r.status IN ('requested', 'confirmed')
                 AND r.requested_start_at < $4::timestamptz + interval '1 hour'
                 AND r.requested_end_at > $4::timestamptz
             )
           ON CONFLICT (dentist_id, requested_start_at)
             WHERE dentist_id IS NOT NULL AND status IN ('requested', 'confirmed')
             DO NOTHING
           RETURNING id, appointment_type_id, dentist_id,
                     requested_start_at, requested_end_at, preferred_date,
                     time_preference, patient_note, status, clinic_note, created_at
         )
         SELECT inserted.*, t.name AS service_name, d.display_name AS dentist_name
         FROM inserted
         JOIN appointment_types t ON t.id = inserted.appointment_type_id
         JOIN dentists d ON d.id = inserted.dentist_id`,
        [patientId, appointmentTypeId, dentistId, startsAt, patientNote, now],
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
