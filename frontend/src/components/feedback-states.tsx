import { AlertTriangle, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/** Shown when a list has no rows because nothing matches the filters. */
export function EmptyState({
  title,
  description,
  action,
  icon: Icon,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
}): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      {Icon ? (
        <div className="rounded-full bg-muted p-3">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
      ) : null}
      <div>
        <p className="font-medium">{title}</p>
        {description ? (
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

/**
 * Error state for a failed request.
 *
 * The backend never leaks stack traces or driver errors, so `message` is safe
 * to show verbatim. A retry action is offered wherever the caller can re-run.
 */
export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}): JSX.Element {
  return (
    <Card className="border-red-200 bg-red-50/50">
      <CardContent className="flex flex-col items-start gap-3 p-5">
        <div className="flex items-center gap-2 text-red-700">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          <p className="font-medium">{title}</p>
        </div>
        {message ? <p className="text-sm text-red-800">{message}</p> : null}
        {onRetry ? (
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Try again
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Inline banner for form-level errors, e.g. a 403 or a 503 from the AI provider. */
export function InlineAlert({
  message,
  variant = 'error',
}: {
  message: string;
  variant?: 'error' | 'warning' | 'info';
}): JSX.Element {
  const styles = {
    error: 'border-red-200 bg-red-50 text-red-800',
    warning: 'border-amber-200 bg-amber-50 text-amber-800',
    info: 'border-sky-200 bg-sky-50 text-sky-800',
  } as const;

  return (
    <div className={cn('rounded-md border p-3 text-sm', styles[variant])} role="alert">
      {message}
    </div>
  );
}