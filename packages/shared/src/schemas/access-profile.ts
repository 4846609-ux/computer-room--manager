import { z } from 'zod';
import { ACCESS_LEVELS } from '../access/access-profile';

const domainList = z
  .array(z.string().trim().min(1).max(253))
  .max(500)
  .optional()
  .default([]);

/** Body for creating / updating an access profile (usage level). */
export const accessProfileSchema = z.object({
  name: z.string().trim().min(1, 'נדרש שם').max(80),
  level: z.nativeEnum(ACCESS_LEVELS).default(ACCESS_LEVELS.CUSTOM),
  allowComputer: z.boolean().default(true),
  allowInternet: z.boolean().default(true),
  allowEmail: z.boolean().default(true),
  allowApps: z.boolean().default(true),
  allowUsb: z.boolean().default(true),
  allowPrinting: z.boolean().default(true),
  blockVideoOnComputer: z.boolean().default(false),
  blockVideoOnInternet: z.boolean().default(false),
  blockedSites: domainList,
  allowedSites: domainList,
  isDefault: z.boolean().optional().default(false),
});

export type AccessProfileInput = z.infer<typeof accessProfileSchema>;

export const updateAccessProfileSchema = accessProfileSchema.partial();
export type UpdateAccessProfileInput = z.infer<typeof updateAccessProfileSchema>;

/** Assign a profile to a customer (null clears it). */
export const assignAccessProfileSchema = z.object({
  accessProfileId: z.string().uuid().nullable(),
});
export type AssignAccessProfileInput = z.infer<typeof assignAccessProfileSchema>;
