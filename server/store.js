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

export function createStore(db) {
  const lockChallengeRateLimits = async (client, ipDigest, lookupDigest) => {
    for (const digest of [ipDigest, lookupDigest].sort()) {
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [digest],
      )
    }
  }

  const challengeWithinLimit = async (
    client,
    { ipDigest, lookupDigest, since, max },
  ) => {
    const result = await client.query(
      `SELECT
         count(*) FILTER (WHERE ip_digest = $1)::integer AS ip_count,
         count(*) FILTER (WHERE lookup_digest = $2)::integer AS lookup_count
       FROM login_challenges
       WHERE created_at >= $3
         AND (ip_digest = $1 OR lookup_digest = $2)`,
      [ipDigest, lookupDigest, since],
    )
    return (
      (result.rows[0]?.ip_count || 0) < max &&
      (result.rows[0]?.lookup_count || 0) < max
    )
  }

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

  return {
    async health() {
      await db.query('SELECT 1')
    },

    async findPatientForLogin(normalizedName, patientNumber) {
      const result = await db.query(
        `SELECT id, display_name, patient_number, phone_e164
         FROM patients
         WHERE normalized_name = $1
           AND patient_number = $2
           AND portal_enabled = true
           AND phone_verified_at IS NOT NULL
         LIMIT 1`,
        [normalizedName, patientNumber],
      )
      return result.rows[0] || null
    },

    async createChallenge(challenge) {
      return db.transaction(async (client) => {
        await lockChallengeRateLimits(
          client,
          challenge.ipDigest,
          challenge.lookupDigest,
        )
        const withinLimit = await challengeWithinLimit(client, {
          ipDigest: challenge.ipDigest,
          lookupDigest: challenge.lookupDigest,
          since: challenge.rateLimitSince,
          max: challenge.rateLimitMax,
        })
        const patientId = withinLimit ? challenge.patientId : null
        const codeDigest = patientId ? challenge.codeDigest : null

        if (patientId) {
          await client.query(
            `UPDATE login_challenges
             SET used_at = $2
             WHERE patient_id = $1 AND used_at IS NULL`,
            [patientId, challenge.createdAt],
          )
        }
        await client.query(
          `INSERT INTO login_challenges (
             id, patient_id, code_digest, expires_at, max_attempts,
             lookup_digest, ip_digest, created_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            challenge.id,
            patientId,
            codeDigest,
            challenge.expiresAt,
            challenge.maxAttempts,
            challenge.lookupDigest,
            challenge.ipDigest,
            challenge.createdAt,
          ],
        )
        return Boolean(patientId)
      })
    },

    async invalidateChallenge(id, when) {
      await db.query(
        'UPDATE login_challenges SET used_at = $2 WHERE id = $1 AND used_at IS NULL',
        [id, when],
      )
    },

    async findChallengeForResend(id) {
      const result = await db.query(
        `SELECT id, lookup_digest, ip_digest
         FROM login_challenges
         WHERE id = $1`,
        [id],
      )
      return result.rows[0]
        ? {
            id: result.rows[0].id,
            lookupDigest: result.rows[0].lookup_digest,
            ipDigest: result.rows[0].ip_digest,
          }
        : null
    },

    async replaceChallenge({
      previousId,
      id,
      codeDigest,
      expiresAt,
      maxAttempts,
      lookupDigest,
      ipDigest,
      createdAt,
      rateLimitSince,
      rateLimitMax,
    }) {
      return db.transaction(async (client) => {
        await lockChallengeRateLimits(client, ipDigest, lookupDigest)
        const withinLimit = await challengeWithinLimit(client, {
          ipDigest,
          lookupDigest,
          since: rateLimitSince,
          max: rateLimitMax,
        })
        const source = await client.query(
          `SELECT c.patient_id, c.used_at, p.phone_e164,
                  p.portal_enabled, p.phone_verified_at
           FROM login_challenges c
           LEFT JOIN patients p ON p.id = c.patient_id
           WHERE c.id = $1
           FOR UPDATE OF c`,
          [previousId],
        )
        const row = source.rows[0]
        const deliverable = Boolean(
          withinLimit &&
            row &&
            !row.used_at &&
            row.patient_id &&
            row.portal_enabled &&
            row.phone_verified_at,
        )

        if (row && !row.used_at) {
          await client.query('UPDATE login_challenges SET used_at = $2 WHERE id = $1', [
            previousId,
            createdAt,
          ])
        }
        await client.query(
          `INSERT INTO login_challenges (
             id, patient_id, code_digest, expires_at, max_attempts,
             lookup_digest, ip_digest, created_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            id,
            deliverable ? row.patient_id : null,
            deliverable ? codeDigest : null,
            expiresAt,
            maxAttempts,
            lookupDigest,
            ipDigest,
            createdAt,
          ],
        )
        return deliverable ? { patientId: row.patient_id, phone: row.phone_e164 } : null
      })
    },

    async verifyChallengeAndCreateSession({
      challengeId,
      codeDigest,
      sessionId,
      tokenDigest,
      now,
      absoluteExpiresAt,
      audit,
    }) {
      return db.transaction(async (client) => {
        const result = await client.query(
          `UPDATE login_challenges c
           SET attempt_count = c.attempt_count + 1,
               used_at = CASE
                 WHEN c.code_digest = $2
                   AND p.portal_enabled = true
                   AND p.phone_verified_at IS NOT NULL
                 THEN $3
                 ELSE c.used_at
               END
           FROM patients p
           WHERE c.id = $1
             AND c.patient_id = p.id
             AND c.used_at IS NULL
             AND c.expires_at > $3
             AND c.attempt_count < c.max_attempts
           RETURNING c.patient_id, p.display_name, p.patient_number,
             (c.code_digest = $2
               AND p.portal_enabled = true
               AND p.phone_verified_at IS NOT NULL) AS verified`,
          [challengeId, codeDigest, now],
        )
        const row = result.rows[0]
        if (!row?.verified) return null

        await client.query(
          `INSERT INTO portal_sessions (
             id, patient_id, token_digest, created_at, last_seen_at, absolute_expires_at
           ) VALUES ($1, $2, $3, $4, $4, $5)`,
          [sessionId, row.patient_id, tokenDigest, now, absoluteExpiresAt],
        )
        await client.query(
          `INSERT INTO audit_events (
             actor_type, actor_id, action, occurred_at, request_id, ip_digest, user_agent
           ) VALUES ('patient', $1, 'portal.login_succeeded', $2, $3, $4, $5)`,
          [
            row.patient_id,
            now,
            audit.requestId,
            audit.ipDigest,
            audit.userAgent?.slice(0, 512) || null,
          ],
        )
        return {
          id: row.patient_id,
          displayName: row.display_name,
          patientNumber: row.patient_number,
        }
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
           AND p.phone_verified_at IS NOT NULL
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
    listAppointments,
    listRecords,
    getTreatmentPlan,

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
      const [appointmentResult, plan, recordResult] = await Promise.all([
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
      ])
      return {
        nextAppointment: appointmentResult.rowCount
          ? appointmentFromRow(appointmentResult.rows[0])
          : null,
        treatmentPlan: plan,
        recentRecord: recordResult.rowCount ? recordFromRow(recordResult.rows[0]) : null,
      }
    },
  }
}
