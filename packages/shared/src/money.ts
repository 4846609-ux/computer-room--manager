/**
 * Money helpers. All monetary amounts are stored and computed as integer minor
 * units (agorot). Never use floats for money in business logic.
 */

export type RoundingRule = 'UP' | 'NEAREST' | 'NONE';

/** Convert a decimal major-unit amount (e.g. 12.50 NIS) to minor units (1250). */
export function toMinor(major: number): number {
  return Math.round(major * 100);
}

/** Convert minor units (1250) to a major-unit number (12.5). */
export function toMajor(minor: number): number {
  return minor / 100;
}

/** Format minor units as a localized currency string. */
export function formatMoney(minor: number, currency = 'ILS', locale = 'he-IL'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(toMajor(minor));
}

/** Round a minor-unit amount to a whole currency unit per the given rule. */
export function roundMinor(minor: number, rule: RoundingRule): number {
  if (rule === 'NONE') return minor;
  const units = minor / 100;
  const rounded = rule === 'UP' ? Math.ceil(units) : Math.round(units);
  return rounded * 100;
}

/**
 * Compute a session charge from elapsed seconds and per-minute price, applying the
 * computer group's billing ratio, minimum charge and minimum time.
 */
export function computeSessionCharge(params: {
  seconds: number;
  pricePerMinuteMinor: number;
  ratio: number;
  minChargeMinor?: number;
  minMinutes?: number;
  rounding?: RoundingRule;
}): number {
  const { seconds, pricePerMinuteMinor, ratio } = params;
  const billableSeconds = Math.max(seconds, (params.minMinutes ?? 0) * 60);
  const minutes = billableSeconds / 60;
  const raw = minutes * pricePerMinuteMinor * ratio;
  const rounded = roundMinor(Math.round(raw), params.rounding ?? 'UP');
  return Math.max(rounded, params.minChargeMinor ?? 0);
}
