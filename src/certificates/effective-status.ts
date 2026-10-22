// The status a certificate really has, and the "usedAt only for used" rule — the frontend
// contract every certificate response follows (one `used` row without usedAt breaks the whole
// list). One place, so the endpoints can't drift apart.

export type EffectiveCertificateStatus = "active" | "used" | "expired";

// "active" in the DB isn't necessarily valid: past validUntil it is expired. There's no cron for
// certificates — the effective status is computed on read, in SQL. `alias` = the certificates
// table's alias in the query.
export const effectiveStatusSql = (alias = "c") =>
  `CASE WHEN ${alias}."status" = 'active' AND ${alias}."validUntil" < now() THEN 'expired' ELSE ${alias}."status"::text END`;

// `{ usedAt }` for a used certificate, `{}` otherwise — the key is absent, not null.
export const usedAtField = (status: string | null, usedAt: Date | null): { usedAt?: Date } =>
  status === "used" && usedAt ? { usedAt } : {};
