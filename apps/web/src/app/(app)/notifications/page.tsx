'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Check } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { PageHeader } from '@/components/data/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface Notification {
  id: string;
  title: string;
  body: string | null;
  severity: string;
  readAt: string | null;
  createdAt: string;
}

const SEVERITY: Record<string, string> = {
  INFO: 'border-s-primary',
  WARNING: 'border-s-status-ending',
  CRITICAL: 'border-s-status-fault',
};

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => apiFetch<Notification[]>('/notifications'),
    refetchInterval: 30_000,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => apiFetch(`/notifications/${id}/read`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread'] });
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="התראות" subtitle="מרכז ההתראות" />
      {isLoading ? (
        <p className="text-muted-foreground">טוען…</p>
      ) : data && data.length > 0 ? (
        <div className="flex flex-col gap-2">
          {data.map((n) => (
            <Card
              key={n.id}
              className={`border-s-4 ${SEVERITY[n.severity] ?? 'border-s-primary'} ${
                n.readAt ? 'opacity-60' : ''
              }`}
            >
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-start gap-3">
                  <Bell className="mt-0.5 h-4 w-4 text-muted-foreground" aria-hidden />
                  <div>
                    <p className="font-medium">{n.title}</p>
                    {n.body && <p className="text-sm text-muted-foreground">{n.body}</p>}
                    <p className="text-xs text-muted-foreground">
                      {new Date(n.createdAt).toLocaleString('he-IL')}
                    </p>
                  </div>
                </div>
                {!n.readAt && (
                  <Button size="sm" variant="outline" onClick={() => markRead.mutate(n.id)}>
                    <Check className="h-4 w-4" aria-hidden />
                    סמן כנקרא
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-border p-8 text-center text-muted-foreground">
          אין התראות
        </p>
      )}
    </div>
  );
}
