import { z } from 'zod';

export const loginSchema = z.object({
  identifier: z.string().min(1, 'נדרש שם משתמש או דוא"ל'),
  password: z.string().min(1, 'נדרשת סיסמה'),
  rememberMe: z.boolean().optional().default(false),
  twoFactorCode: z.string().optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().optional(), // usually read from httpOnly cookie
});

export const passwordResetRequestSchema = z.object({
  email: z.string().email(),
});

export const passwordResetSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8, 'סיסמה חייבת להכיל לפחות 8 תווים'),
});

export interface AuthPrincipal {
  employeeId: string;
  tenantId: string;
  roles: string[];
  permissions: string[];
  branchIds: string[]; // empty = all branches
}
