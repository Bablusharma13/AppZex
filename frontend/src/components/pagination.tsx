import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { PageMeta } from '@/services/auth.service';

export interface PaginationProps {
  pagination: Pick<PageMeta, 'page' | 'limit' | 'total' | 'totalPages'>;
  onPageChange: (page: number) => void;
  /** Dims the controls while a new page is loading. */
  isLoading?: boolean;
}

/** Server-side pagination control used by every list page. */
export function Pagination({
  pagination,
  onPageChange,
  isLoading = false,
}: PaginationProps): JSX.Element | null {
  const { page, total, totalPages } = pagination;

  if (total === 0) return null;

  const firstItem = (page - 1) * pagination.limit + 1;
  const lastItem = Math.min(page * pagination.limit, total);

  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-border px-4 py-3 sm:flex-row">
      <p className={cn('text-sm text-muted-foreground', isLoading && 'opacity-60')}>
        Showing <span className="font-medium text-foreground">{firstItem}</span>–
        <span className="font-medium text-foreground">{lastItem}</span> of{' '}
        <span className="font-medium text-foreground">{total}</span>
      </p>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1 || isLoading}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          Previous
        </Button>

        <span className="px-2 text-sm text-muted-foreground">
          Page {page} of {Math.max(totalPages, 1)}
        </span>

        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages || isLoading}
        >
          Next
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}