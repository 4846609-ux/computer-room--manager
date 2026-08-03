'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { Monitor, LogIn } from 'lucide-react';
import { loginSchema, type LoginInput } from '@crm/shared';
import { apiFetch, ApiError, setAccessToken } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';

export default function LoginPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ defaultValues: { rememberMe: true } });

  async function onSubmit(values: LoginInput) {
    setServerError(null);
    const parsed = loginSchema.safeParse(values);
    if (!parsed.success) {
      setServerError('אנא מלא את השדות הנדרשים');
      return;
    }
    try {
      const res = await apiFetch<{ accessToken: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(parsed.data),
      });
      setAccessToken(res.accessToken);
      if (typeof window !== 'undefined') localStorage.setItem('crm_at', res.accessToken);
      router.push('/dashboard');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'AUTH_2FA_REQUIRED') {
        setServerError('נדרש קוד אימות דו-שלבי');
      } else if (err instanceof ApiError) {
        setServerError(err.message);
      } else {
        setServerError('שגיאת התחברות לשרת');
      }
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Monitor className="h-7 w-7" aria-hidden />
          </div>
          <h1 className="text-2xl font-bold">Computer Room Manager</h1>
          <p className="text-sm text-muted-foreground">מערכת ניהול חדרי מחשבים ועמדות</p>
        </div>

        <Card>
          <CardContent className="p-6">
            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="identifier" className="text-sm font-medium">
                  שם משתמש או דוא"ל
                </label>
                <Input
                  id="identifier"
                  autoComplete="username"
                  aria-invalid={!!errors.identifier}
                  {...register('identifier', { required: true })}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="password" className="text-sm font-medium">
                  סיסמה
                </label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  aria-invalid={!!errors.password}
                  {...register('password', { required: true })}
                />
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 rounded" {...register('rememberMe')} />
                זכור אותי
              </label>

              {serverError && (
                <p role="alert" className="rounded-md bg-status-fault/10 px-3 py-2 text-sm text-status-fault">
                  {serverError}
                </p>
              )}

              <Button type="submit" size="lg" disabled={isSubmitting} className="w-full">
                <LogIn className="h-4 w-4" aria-hidden />
                {isSubmitting ? 'מתחבר…' : 'כניסה'}
              </Button>

              <a href="#" className="text-center text-sm text-primary hover:underline">
                שכחתי סיסמה
              </a>
            </form>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          לפיתוח: owner@demo.crm / Passw0rd!
        </p>
      </div>
    </main>
  );
}
