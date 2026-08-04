import type { ReactNode } from 'react';

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  align?: 'start' | 'end' | 'center';
}

/**
 * Simple, accessible, RTL-friendly table. On small screens the caller can swap to
 * cards; here we keep horizontal scroll contained so the page never scrolls sideways.
 */
export function DataTable<T extends { id: string }>({
  columns,
  rows,
  isLoading,
  emptyText = 'אין נתונים להצגה',
}: {
  columns: Column<T>[];
  rows: T[];
  isLoading?: boolean;
  emptyText?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-secondary/60">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={`px-4 py-3 font-medium text-muted-foreground text-${c.align ?? 'start'}`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-muted-foreground">
                טוען…
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-muted-foreground">
                {emptyText}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id} className="border-t border-border hover:bg-secondary/40">
                {columns.map((c) => (
                  <td key={c.key} className={`px-4 py-3 text-${c.align ?? 'start'}`}>
                    {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
