'use client';

import { useState } from 'react';
import { Monitor, Wallet, LogIn, Check } from 'lucide-react';
import { formatILS } from '@/lib/utils';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const TENANT = 'demo'; // a kiosk is provisioned per organization/branch

async function kioskFetch<T>(path: string, body?: unknown, token?: string): Promise<T> {
  const res = await fetch(`${API}/api/v1/kiosk${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'x-kiosk-token': token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error?.message ?? 'שגיאה');
  return json as T;
}

type Balance = { moneyMinor: number; timeSecondsRemaining: number; printBwRemaining: number };
type Pkg = { id: string; name: string; prices: { priceMinor: number }[] };
type Comp = { id: string; name: string; stationNumber: string | null };

export default function KioskPage() {
  const [step, setStep] = useState<'phone' | 'code' | 'home'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const [name, setName] = useState('');
  const [balance, setBalance] = useState<Balance | null>(null);
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [computers, setComputers] = useState<Comp[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function requestOtp() {
    setMsg(null);
    setBusy(true);
    try {
      const r = await kioskFetch<{ sent: boolean; devCode?: string }>('/otp/request', {
        tenantSlug: TENANT,
        phone,
      });
      setDevCode(r.devCode ?? null);
      setStep('code');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'שגיאה');
    } finally {
      setBusy(false);
    }
  }

  async function loadHome(tk: string) {
    const [me, pkgs, comps] = await Promise.all([
      kioskFetch<{ fullName: string; balance: Balance }>('/me', undefined, tk),
      kioskFetch<Pkg[]>('/packages', undefined, tk),
      kioskFetch<Comp[]>('/computers', undefined, tk),
    ]);
    setName(me.fullName);
    setBalance(me.balance);
    setPackages(pkgs);
    setComputers(comps);
  }

  async function verifyOtp() {
    setMsg(null);
    setBusy(true);
    try {
      const r = await kioskFetch<{ token: string; customer: { fullName: string } }>('/otp/verify', {
        tenantSlug: TENANT,
        phone,
        code,
      });
      setToken(r.token);
      await loadHome(r.token);
      setStep('home');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'קוד שגוי');
    } finally {
      setBusy(false);
    }
  }

  async function buy(pkgId: string) {
    setBusy(true);
    setMsg(null);
    try {
      await kioskFetch('/buy', { packageId: pkgId }, token);
      await loadHome(token);
      setMsg('הרכישה בוצעה!');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'שגיאה ברכישה');
    } finally {
      setBusy(false);
    }
  }

  async function openStation(id: string) {
    setBusy(true);
    setMsg(null);
    try {
      await kioskFetch('/open', { computerId: id }, token);
      setMsg('העמדה נפתחה — שימוש נעים!');
      await loadHome(token);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'לא ניתן לפתוח עמדה');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-2xl">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Monitor className="h-8 w-8" aria-hidden />
          </div>
          <h1 className="text-3xl font-bold">עמדת שירות עצמי</h1>
        </div>

        {msg && (
          <p className="mb-4 rounded-lg bg-secondary px-4 py-3 text-center text-lg">{msg}</p>
        )}

        {step === 'phone' && (
          <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6">
            <label className="text-lg font-medium">הזן מספר טלפון</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              className="h-14 rounded-lg border border-input bg-background px-4 text-xl"
              placeholder="050-0000000"
            />
            <button
              onClick={requestOtp}
              disabled={busy || phone.length < 3}
              className="h-14 rounded-lg bg-primary text-lg font-bold text-primary-foreground disabled:opacity-50"
            >
              שלח קוד כניסה
            </button>
          </div>
        )}

        {step === 'code' && (
          <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6">
            <label className="text-lg font-medium">הזן את הקוד שקיבלת</label>
            {devCode && (
              <p className="rounded-md bg-status-ending/10 px-3 py-2 text-center text-sm">
                קוד לפיתוח: <b>{devCode}</b>
              </p>
            )}
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              maxLength={6}
              className="h-14 rounded-lg border border-input bg-background px-4 text-center text-2xl tracking-widest"
              placeholder="______"
            />
            <button
              onClick={verifyOtp}
              disabled={busy || code.length !== 6}
              className="h-14 rounded-lg bg-primary text-lg font-bold text-primary-foreground disabled:opacity-50"
            >
              <LogIn className="mx-auto h-6 w-6" aria-hidden />
            </button>
          </div>
        )}

        {step === 'home' && (
          <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between rounded-xl border border-border bg-card p-5">
              <div>
                <p className="text-lg font-bold">שלום, {name}</p>
                <p className="text-sm text-muted-foreground">
                  זמן: {Math.round((balance?.timeSecondsRemaining ?? 0) / 60)} דק׳ · הדפסות:{' '}
                  {balance?.printBwRemaining ?? 0}
                </p>
              </div>
              <div className="flex items-center gap-2 text-2xl font-bold text-primary">
                <Wallet className="h-6 w-6" aria-hidden />
                {formatILS(balance?.moneyMinor ?? 0)}
              </div>
            </div>

            <section>
              <h2 className="mb-3 text-xl font-bold">רכישת חבילה</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {packages.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => buy(p.id)}
                    disabled={busy}
                    className="rounded-xl border border-border bg-card p-4 text-center hover:border-primary disabled:opacity-50"
                  >
                    <p className="font-bold">{p.name}</p>
                    <p className="text-primary">{formatILS(p.prices[0]?.priceMinor ?? 0)}</p>
                  </button>
                ))}
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-bold">בחירת עמדה פנויה</h2>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {computers.length === 0 && (
                  <p className="col-span-full text-muted-foreground">אין עמדות פנויות כרגע</p>
                )}
                {computers.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => openStation(c.id)}
                    disabled={busy}
                    className="flex flex-col items-center gap-1 rounded-xl border-2 border-status-available/40 bg-card p-4 hover:border-status-available disabled:opacity-50"
                  >
                    <Check className="h-5 w-5 text-status-available" aria-hidden />
                    <span className="font-bold">עמדה {c.stationNumber ?? c.name}</span>
                  </button>
                ))}
              </div>
            </section>

            <button
              onClick={() => {
                setStep('phone');
                setToken('');
                setPhone('');
                setCode('');
                setMsg(null);
              }}
              className="mx-auto text-sm text-muted-foreground underline"
            >
              סיום / משתמש אחר
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
