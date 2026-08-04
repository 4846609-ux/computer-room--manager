'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { formatILS } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export interface NedarimPrepared {
  iframeUrl: string;
  fields: Record<string, string>;
  paymentId: string;
  saleId: string;
  amountMinor: number;
}

/**
 * Nedarim Plus secured-iframe payment. Follows their protocol precisely: the message
 * listener and iframe src are set up ONCE; the card is entered inside their iframe;
 * on FinishTransaction2 we get a TransactionResponse — but success is confirmed by
 * polling OUR server (the CallBack is authoritative), per their security guidance.
 *
 * Note: Nedarim's postMessage does not work on localhost. In dev, use "אישור ידני".
 */
export function NedarimPayment({
  prepared,
  onDone,
  onCancel,
  allowDevConfirm = true,
}: {
  prepared: NedarimPrepared;
  onDone: () => void;
  onCancel: () => void;
  allowDevConfirm?: boolean;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'processing' | 'confirming'>('idle');

  // Register the listener + set the iframe src exactly once.
  useEffect(() => {
    function post(data: unknown) {
      frameRef.current?.contentWindow?.postMessage(data, '*');
    }
    function onMessage(event: MessageEvent) {
      const data = event.data as { Name?: string; Value?: unknown };
      if (!data?.Name) return;
      if (data.Name === 'Height' && frameRef.current) {
        frameRef.current.style.height = `${parseInt(String(data.Value), 10) + 15}px`;
      } else if (data.Name === 'TransactionResponse') {
        const value = data.Value as { Status?: string; Message?: string };
        if (value?.Status === 'Error') {
          setBusy(false);
          setStatus('idle');
          setError(value.Message ?? 'העסקה נדחתה');
        } else {
          // Client says OK — now confirm with OUR server (authoritative).
          setStatus('confirming');
          pollStatus();
        }
      }
    }
    window.addEventListener('message', onMessage);
    const frame = frameRef.current;
    if (frame) {
      frame.onload = () => post({ Name: 'GetHeight' });
      frame.src = prepared.iframeUrl;
    }
    return () => window.removeEventListener('message', onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function pollStatus() {
    for (let i = 0; i < 30; i++) {
      try {
        const r = await apiFetch<{ status: string }>(`/payments/nedarim/status/${prepared.paymentId}`);
        if (r.status === 'COMPLETED') {
          onDone();
          return;
        }
      } catch {
        /* keep polling */
      }
      await new Promise((res) => setTimeout(res, 2000));
    }
    setError('לא התקבל אישור מהשרת. בדוק את סטטוס העסקה.');
    setStatus('idle');
    setBusy(false);
  }

  function pay() {
    setError(null);
    setBusy(true);
    setStatus('processing');
    frameRef.current?.contentWindow?.postMessage(
      { Name: 'FinishTransaction2', Value: prepared.fields },
      '*',
    );
  }

  async function devConfirm() {
    setStatus('confirming');
    await apiFetch('/payments/nedarim/dev-settle', {
      method: 'POST',
      body: JSON.stringify({ paymentId: prepared.paymentId }),
    }).catch(() => {});
    onDone();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg bg-card p-5 shadow-lg">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-bold">תשלום באשראי — נדרים פלוס</h3>
          <button onClick={onCancel} aria-label="סגירה" className="rounded p-1 hover:bg-secondary">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <p className="mb-3 text-sm text-muted-foreground">לתשלום: {formatILS(prepared.amountMinor)}</p>

        {/* Nedarim secured iframe — card fields render inside it. */}
        <iframe
          ref={frameRef}
          id="NedarimFrame"
          title="Nedarim Plus"
          scrolling="no"
          className="w-full rounded-md border border-border"
          style={{ height: 0, border: 'none' }}
        />

        {error && (
          <p role="alert" className="mt-2 rounded-md bg-status-fault/10 px-3 py-2 text-sm text-status-fault">
            {error}
          </p>
        )}
        {status === 'confirming' && (
          <p className="mt-2 text-sm text-muted-foreground">מאמת מול השרת…</p>
        )}

        <div className="mt-4 flex items-center gap-2">
          <Button onClick={pay} disabled={busy} className="flex-1">
            {busy ? 'מעבד…' : `שלם ${formatILS(prepared.amountMinor)}`}
          </Button>
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            ביטול
          </Button>
        </div>

        {allowDevConfirm && (
          <button onClick={devConfirm} className="mt-3 w-full text-center text-xs text-muted-foreground underline">
            אישור ידני (סביבת פיתוח — עוקף את נדרים)
          </button>
        )}
      </div>
    </div>
  );
}
