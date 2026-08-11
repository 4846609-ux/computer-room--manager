'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, Send, Search } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { PageHeader } from '@/components/data/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface Conversation {
  customerId: string;
  customerName: string;
  customerNumber: number;
  lastBody: string;
  lastAt: string;
  unread: number;
}
interface Message {
  id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  body: string;
  readAt: string | null;
  createdAt: string;
}
interface Thread {
  customer: { id: string; fullName: string; customerNumber: number };
  messages: Message[];
}

export default function InquiriesPage() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [q, setQ] = useState('');
  const [draft, setDraft] = useState('');

  const { data: convs } = useQuery({
    queryKey: ['inquiries', onlyUnread],
    queryFn: () =>
      apiFetch<{ data: Conversation[]; meta: { totalUnread: number } }>(
        `/inquiries${onlyUnread ? '?unread=1' : ''}`,
      ),
    refetchInterval: 15000,
  });

  const { data: thread } = useQuery({
    queryKey: ['inquiry-thread', selected],
    queryFn: () => apiFetch<Thread>(`/inquiries/${selected}`),
    enabled: !!selected,
    refetchInterval: 10000,
  });

  const markRead = useMutation({
    mutationFn: (customerId: string) => apiFetch(`/inquiries/${customerId}/read`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['inquiries'] }),
  });

  const reply = useMutation({
    mutationFn: (body: string) =>
      apiFetch(`/inquiries/${selected}`, { method: 'POST', body: JSON.stringify({ body }) }),
    onSuccess: () => {
      setDraft('');
      queryClient.invalidateQueries({ queryKey: ['inquiry-thread', selected] });
      queryClient.invalidateQueries({ queryKey: ['inquiries'] });
    },
  });

  const openConversation = (id: string, unread: number) => {
    setSelected(id);
    if (unread > 0) markRead.mutate(id);
  };

  const list = (convs?.data ?? []).filter(
    (c) => !q || c.customerName.includes(q) || String(c.customerNumber).includes(q),
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="פניות לקוחות"
        subtitle="צ׳אט דו־כיווני מול הלקוחות"
        action={
          convs?.meta?.totalUnread ? <Badge>{convs.meta.totalUnread} שלא נקראו</Badge> : null
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
        {/* Conversation list */}
        <Card className="flex flex-col overflow-hidden">
          <div className="flex flex-col gap-2 border-b border-border p-3">
            <div className="flex items-center gap-2 rounded-md border border-input bg-card px-2">
              <Search className="h-4 w-4 text-muted-foreground" aria-hidden />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="חפש לקוח"
                className="h-9 flex-1 bg-transparent text-sm outline-none"
              />
            </div>
            <div className="flex gap-1 text-sm">
              <button
                onClick={() => setOnlyUnread(false)}
                className={`flex-1 rounded-md px-2 py-1 ${!onlyUnread ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`}
              >
                הכל
              </button>
              <button
                onClick={() => setOnlyUnread(true)}
                className={`flex-1 rounded-md px-2 py-1 ${onlyUnread ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`}
              >
                שלא נקראו
              </button>
            </div>
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {list.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">אין שיחות</p>
            ) : (
              list.map((c) => (
                <button
                  key={c.customerId}
                  onClick={() => openConversation(c.customerId, c.unread)}
                  className={`flex w-full flex-col gap-1 border-b border-border p-3 text-right hover:bg-secondary ${selected === c.customerId ? 'bg-secondary' : ''}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{c.customerName}</span>
                    {c.unread > 0 && (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs text-primary-foreground">
                        {c.unread}
                      </span>
                    )}
                  </div>
                  <span className="truncate text-xs text-muted-foreground">{c.lastBody}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {new Date(c.lastAt).toLocaleString('he-IL')}
                  </span>
                </button>
              ))
            )}
          </div>
        </Card>

        {/* Thread */}
        <Card className="flex min-h-[60vh] flex-col">
          {!selected ? (
            <CardContent className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
              <MessageSquare className="h-10 w-10" aria-hidden />
              <p>בחר שיחה מהרשימה כדי להציג את ההתכתבות</p>
            </CardContent>
          ) : (
            <>
              <div className="border-b border-border p-3 font-semibold">
                {thread?.customer?.fullName ?? '…'}
                {thread?.customer ? (
                  <span className="mr-2 text-xs font-normal text-muted-foreground">
                    מס׳ {thread.customer.customerNumber}
                  </span>
                ) : null}
              </div>
              <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
                {(thread?.messages ?? []).map((m) => (
                  <div
                    key={m.id}
                    className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                      m.direction === 'OUTBOUND'
                        ? 'self-start bg-primary text-primary-foreground'
                        : 'self-end bg-secondary'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{m.body}</p>
                    <p className="mt-1 text-[10px] opacity-70">
                      {new Date(m.createdAt).toLocaleString('he-IL')}
                    </p>
                  </div>
                ))}
                {thread && thread.messages.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground">אין הודעות עדיין</p>
                )}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (draft.trim()) reply.mutate(draft.trim());
                }}
                className="flex items-center gap-2 border-t border-border p-3"
              >
                <Input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="כתוב תגובה…"
                  className="flex-1"
                />
                <Button type="submit" disabled={!draft.trim() || reply.isPending}>
                  <Send className="h-4 w-4" aria-hidden />
                  שלח
                </Button>
              </form>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
