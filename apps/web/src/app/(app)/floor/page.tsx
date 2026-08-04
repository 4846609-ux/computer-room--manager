'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Save, Move, Eye } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import type { FloorData, RoomRow } from '@/lib/types';
import { COMPUTER_STATUS } from '@/components/ui/badge';
import { PageHeader } from '@/components/data/page-header';
import { Button } from '@/components/ui/button';

type Pos = { x: number; y: number };

/** Auto-place computers in a grid when they have no saved position. */
function autoLayout(ids: string[], saved: Record<string, Pos>): Record<string, Pos> {
  const result: Record<string, Pos> = { ...saved };
  let i = 0;
  for (const id of ids) {
    if (!result[id]) {
      const col = i % 6;
      const row = Math.floor(i / 6);
      result[id] = { x: 24 + col * 150, y: 24 + row * 110 };
    }
    i++;
  }
  return result;
}

export default function FloorPlanPage() {
  const [roomId, setRoomId] = useState<string>('');
  const [editing, setEditing] = useState(false);
  const [positions, setPositions] = useState<Record<string, Pos>>({});
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null);

  const { data: rooms } = useQuery({
    queryKey: ['rooms'],
    queryFn: () => apiFetch<RoomRow[]>('/rooms'),
  });

  useEffect(() => {
    if (!roomId && rooms && rooms.length > 0) setRoomId(rooms[0].id);
  }, [rooms, roomId]);

  const { data: floor } = useQuery({
    queryKey: ['floor', roomId],
    queryFn: () => apiFetch<FloorData>(`/rooms/${roomId}/floor`),
    enabled: !!roomId,
    refetchInterval: editing ? false : 15_000,
  });

  // Initialize positions when floor data (re)loads and we're not mid-edit.
  useEffect(() => {
    if (!floor || dirty) return;
    const savedMap: Record<string, Pos> = {};
    for (const l of floor.floorPlan.layout) savedMap[l.computerId] = { x: l.x, y: l.y };
    setPositions(autoLayout(floor.computers.map((c) => c.id), savedMap));
  }, [floor, dirty]);

  function onPointerDown(e: React.PointerEvent, id: string) {
    if (!editing) return;
    const pos = positions[id] ?? { x: 0, y: 0 };
    dragRef.current = { id, dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    setPositions((p) => ({
      ...p,
      [drag.id]: { x: Math.max(0, e.clientX - drag.dx), y: Math.max(0, e.clientY - drag.dy) },
    }));
    setDirty(true);
  }
  function onPointerUp() {
    dragRef.current = null;
  }

  async function save() {
    if (!floor) return;
    const layout = Object.entries(positions).map(([computerId, p]) => ({ computerId, ...p }));
    await apiFetch(`/rooms/${roomId}/floor`, {
      method: 'PUT',
      body: JSON.stringify({ width: floor.floorPlan.width, height: floor.floorPlan.height, layout }),
    });
    setDirty(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="חדרים בזמן אמת"
        subtitle="מפת עמדות עם מצב חי"
        action={
          <div className="flex items-center gap-2">
            <Button variant={editing ? 'primary' : 'outline'} onClick={() => setEditing((v) => !v)}>
              {editing ? <Move className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
              {editing ? 'מצב עריכה' : 'מצב צפייה'}
            </Button>
            {editing && (
              <Button onClick={save} disabled={!dirty}>
                <Save className="h-4 w-4" aria-hidden />
                שמור פריסה
              </Button>
            )}
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={roomId}
          onChange={(e) => {
            setRoomId(e.target.value);
            setDirty(false);
          }}
          className="h-10 rounded-md border border-input bg-card px-3 text-sm"
          aria-label="בחירת חדר"
        >
          {rooms?.map((r) => (
            <option key={r.id} value={r.id}>
              {r.branch?.name ? `${r.branch.name} — ` : ''}{r.name}
            </option>
          ))}
        </select>
        {saved && <span className="text-sm text-status-available">הפריסה נשמרה ✓</span>}
        {editing && <span className="text-sm text-muted-foreground">גרור עמדות למיקום הרצוי</span>}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        {Object.values(COMPUTER_STATUS).map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${s.dot}`} aria-hidden />
            {s.label}
          </span>
        ))}
      </div>

      <div className="overflow-auto rounded-lg border border-border bg-secondary/30 p-2">
        <div
          className="relative"
          style={{ width: floor?.floorPlan.width ?? 1000, height: floor?.floorPlan.height ?? 700 }}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          {floor?.computers.map((c) => {
            const pos = positions[c.id] ?? { x: 0, y: 0 };
            const s = COMPUTER_STATUS[c.status] ?? { label: c.status, dot: 'bg-muted-foreground' };
            return (
              <div
                key={c.id}
                onPointerDown={(e) => onPointerDown(e, c.id)}
                className={`absolute w-[132px] rounded-lg border-2 border-border bg-card p-2 shadow-sm ${
                  editing ? 'cursor-move' : ''
                }`}
                style={{ insetInlineStart: pos.x, top: pos.y }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold">עמדה {c.stationNumber ?? '—'}</span>
                  <span className={`h-3 w-3 rounded-full ${s.dot}`} title={s.label} aria-label={s.label} />
                </div>
                <p className="truncate text-xs text-muted-foreground">{c.name}</p>
                {c.connectedUser ? (
                  <p className="truncate text-xs">{c.connectedUser}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                )}
              </div>
            );
          })}
          {floor && floor.computers.length === 0 && (
            <p className="p-6 text-sm text-muted-foreground">אין מחשבים בחדר זה</p>
          )}
        </div>
      </div>
    </div>
  );
}
