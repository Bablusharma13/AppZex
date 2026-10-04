import { cn } from '@/lib/utils';

/**
 * Progress bar driven by the server-derived percentage.
 *
 * `value` is never computed in the browser from a user-entered field: the API
 * calculates progress from completed tasks, and this component only renders it.
 */
export function ProgressBar({
  value,
  label,
  showValue = true,
  className,
}: {
  /** 0-100. Clamped defensively so a bad value cannot break the layout. */
  value: number;
  label?: string;
  showValue?: boolean;
  className?: string;
}): JSX.Element {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const tone =
    clamped >= 100 ? 'bg-emerald-500' : clamped >= 60 ? 'bg-sky-500' : clamped >= 30 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div className={cn('space-y-1', className)}>
      {(label || showValue) && (
        <div className="flex items-center justify-between gap-2 text-xs">
          {label ? <span className="text-muted-foreground">{label}</span> : <span />}
          {showValue ? (
            <span className="font-medium tabular-nums text-foreground">{clamped}%</span>
          ) : null}
        </div>
      )}
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? 'Progress'}
      >
        <div className={cn('h-full rounded-full transition-all', tone)} style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}