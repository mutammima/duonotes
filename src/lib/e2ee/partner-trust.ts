/**
 * Trust on first use for the partner's public key. A CHANGED key is never
 * adopted automatically: no note key is wrapped for it until the codes are
 * compared again (spec, "Partner key trust"). A key the owner said does NOT
 * match ("They don't match") is stored as rejected and treated as changed, so
 * nothing is wrapped for it until the codes are compared and match.
 */
export interface PartnerTrust {
  key: string; // base64 X25519 public key
  verified: boolean;
  /** The owner compared codes for this key and they did not match. */
  rejected?: true;
}

export type PartnerKeyStatus = 'none' | 'unverified' | 'verified' | 'changed';

export function evaluatePartnerKey(
  stored: PartnerTrust | null,
  current: string | null,
): { status: PartnerKeyStatus; next: PartnerTrust | null } {
  if (!current) return { status: 'none', next: stored };
  if (!stored) return { status: 'unverified', next: { key: current, verified: false } };
  if (stored.key === current && stored.rejected) return { status: 'changed', next: stored };
  if (stored.key === current) return { status: stored.verified ? 'verified' : 'unverified', next: stored };
  return { status: 'changed', next: stored };
}

export function canWrapFor(status: PartnerKeyStatus): boolean {
  return status === 'unverified' || status === 'verified';
}

/** "They match": adopt exactly this key, clearing any earlier rejection. */
export function markVerified(current: string): PartnerTrust {
  return { key: current, verified: true };
}

/** "They don't match": remember this key as rejected so nothing is wrapped for it. */
export function markRejected(current: string): PartnerTrust {
  return { key: current, verified: false, rejected: true };
}

/**
 * Parse a stored record, failing CLOSED: `null` only when nothing is stored
 * (first use); any unreadable or malformed record throws. Reading a corrupt
 * record as "first use" would silently trust whatever key the server now holds.
 */
export function parsePartnerTrust(raw: string | null): PartnerTrust | null {
  if (raw === null) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error('corrupt partner-trust record');
  }
  const d = data as Record<string, unknown> | null;
  if (
    typeof d !== 'object' || d === null || Array.isArray(d) ||
    typeof d.key !== 'string' || typeof d.verified !== 'boolean' ||
    !(d.rejected === undefined || d.rejected === true)
  ) {
    throw new Error('corrupt partner-trust record');
  }
  return d.rejected ? { key: d.key, verified: d.verified, rejected: true } : { key: d.key, verified: d.verified };
}
