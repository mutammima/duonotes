/**
 * Trust on first use for the partner's public key. A CHANGED key is never
 * adopted automatically: no note key is wrapped for it until the codes are
 * compared again (spec, "Partner key trust").
 */
export interface PartnerTrust {
  key: string; // base64 X25519 public key
  verified: boolean;
}

export type PartnerKeyStatus = 'none' | 'unverified' | 'verified' | 'changed';

export function evaluatePartnerKey(
  stored: PartnerTrust | null,
  current: string | null,
): { status: PartnerKeyStatus; next: PartnerTrust | null } {
  if (!current) return { status: 'none', next: stored };
  if (!stored) return { status: 'unverified', next: { key: current, verified: false } };
  if (stored.key === current) return { status: stored.verified ? 'verified' : 'unverified', next: stored };
  return { status: 'changed', next: stored };
}

export function canWrapFor(status: PartnerKeyStatus): boolean {
  return status === 'unverified' || status === 'verified';
}

export function markVerified(current: string): PartnerTrust {
  return { key: current, verified: true };
}
