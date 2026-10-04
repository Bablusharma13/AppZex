'use client';

import { initials } from '@/utils/format';
import { cn } from '@/lib/utils';

/** Initials avatar. No external image service, so it also works offline. */
export function Avatar({
  name,
  className,
}: {
  name?: string;
  className?: string;
}): JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary',
        className,
      )}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}