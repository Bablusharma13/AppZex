import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export interface Column<T> {
  /** Column header. Omit for a column that is purely visual. */
  header: string;
  /** Cell renderer. Keep each one small; extract logic into components. */
  cell: (row: T) => ReactNode;
  /** Extra classes applied to every cell in the column. */
  className?: string;
  /** Applied to the header cell. */
  headerClassName?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  /** Stable key for each row. */
  rowKey: (row: T) => string;
  isLoading?: boolean;
  /** Rendered when there are no rows and loading has finished. */
  emptyState?: ReactNode;
  caption?: string;
  onRowClick?: (row: T) => void;
}

/**
 * Presentational table used by every list page.
 *
 * Handles loading and empty states so no page has to re-implement them, and
 * scrolls horizontally on small screens rather than squashing columns.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  isLoading = false,
  emptyState,
  caption,
  onRowClick,
}: DataTableProps<T>): JSX.Element {
  if (isLoading) {
    return (
      <div className="p-6">
        <div className="space-y-3" role="status" aria-label="Loading data">
          {Array.from({ length: 5 }).map((_, rowIndex) => (
            <div key={rowIndex} className="flex gap-3">
              {columns.map((column, columnIndex) => (
                <div key={columnIndex} className="h-8 flex-1 animate-pulse rounded bg-muted" />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    return <>{emptyState ?? <p className="p-6 text-center text-sm text-muted-foreground">No records found.</p>}</>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full caption-bottom text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead className="border-b border-border bg-muted/40">
          <tr>
            {columns.map((column, index) => (
              <th
                key={index}
                scope="col"
                className={cn(
                  'whitespace-nowrap px-4 py-3 text-left align-middle text-xs font-semibold uppercase tracking-wide text-muted-foreground',
                  column.headerClassName,
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                'transition-colors hover:bg-muted/40',
                onRowClick && 'cursor-pointer',
              )}
            >
              {columns.map((column, index) => (
                <td key={index} className={cn('px-4 py-3 align-middle', column.className)}>
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}