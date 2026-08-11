/**
 * Access profiles = usage levels a customer/session is granted on a station.
 * These are the "רמות משתמש" (user levels) the operator can assign:
 *   1) COMPUTER_ONLY — the computer works, but no internet / email.
 *   2) EMAIL_ONLY    — only email (a locked-down browser to webmail), nothing else.
 *   3) CUSTOM        — the operator hand-picks exactly what is allowed/blocked.
 *   4) video blocking — orthogonal toggles that block video playback locally
 *      (files on the PC) and/or online (streaming sites) — separately.
 *
 * The data model keeps granular booleans so the four "levels" are really just
 * presets over the same switches; the operator can start from a preset and then
 * fine-tune. The Windows Agent enforces the policy on the station (allow-listed
 * command APPLY_ACCESS_POLICY); the server is the source of truth.
 */

export const ACCESS_LEVELS = {
  COMPUTER_ONLY: 'COMPUTER_ONLY',
  EMAIL_ONLY: 'EMAIL_ONLY',
  CUSTOM: 'CUSTOM',
  FULL: 'FULL',
} as const;

export type AccessLevel = (typeof ACCESS_LEVELS)[keyof typeof ACCESS_LEVELS];

export const ACCESS_LEVEL_LABELS: Record<AccessLevel, string> = {
  COMPUTER_ONLY: 'מחשב בלבד',
  EMAIL_ONLY: 'אימייל בלבד',
  CUSTOM: 'הגדרות מיוחדות',
  FULL: 'גישה מלאה',
};

/** The granular switches that make up a policy. */
export interface AccessPolicy {
  /** Allow using the computer at all (false = station stays locked). */
  allowComputer: boolean;
  /** Allow general internet browsing. */
  allowInternet: boolean;
  /** Allow email / webmail. */
  allowEmail: boolean;
  /** Allow office / general applications (word processing, etc.). */
  allowApps: boolean;
  /** Allow USB / removable storage. */
  allowUsb: boolean;
  /** Allow printing from the station. */
  allowPrinting: boolean;
  /** Block video playback of local files on the computer. */
  blockVideoOnComputer: boolean;
  /** Block video on internet sites (YouTube, streaming, etc.). */
  blockVideoOnInternet: boolean;
  /** Extra site domains to block (only relevant when internet is allowed). */
  blockedSites: string[];
  /** Only these site domains are reachable (allow-list). Empty = no allow-list. */
  allowedSites: string[];
}

export const DEFAULT_ACCESS_POLICY: AccessPolicy = {
  allowComputer: true,
  allowInternet: true,
  allowEmail: true,
  allowApps: true,
  allowUsb: true,
  allowPrinting: true,
  blockVideoOnComputer: false,
  blockVideoOnInternet: false,
  blockedSites: [],
  allowedSites: [],
};

/** Preset policies for the built-in levels. CUSTOM starts from FULL. */
export const ACCESS_LEVEL_PRESETS: Record<AccessLevel, AccessPolicy> = {
  COMPUTER_ONLY: {
    ...DEFAULT_ACCESS_POLICY,
    allowInternet: false,
    allowEmail: false,
    blockVideoOnInternet: true,
  },
  EMAIL_ONLY: {
    ...DEFAULT_ACCESS_POLICY,
    allowInternet: false,
    allowEmail: true,
    allowApps: false,
    allowUsb: false,
    blockVideoOnComputer: true,
    blockVideoOnInternet: true,
  },
  CUSTOM: { ...DEFAULT_ACCESS_POLICY },
  FULL: { ...DEFAULT_ACCESS_POLICY },
};

export function presetForLevel(level: AccessLevel): AccessPolicy {
  return { ...ACCESS_LEVEL_PRESETS[level] };
}

/** Payload sent to the Agent (APPLY_ACCESS_POLICY). */
export interface AccessPolicyPayload extends AccessPolicy {
  profileId: string;
  profileName: string;
  level: AccessLevel;
}
