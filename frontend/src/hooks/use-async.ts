'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError } from '@/lib/api-client';

interface AsyncState<T> {
  data: T | null;
  isLoading: boolean;
  error: ApiError | null;
}

/**
 * Runs an async loader on mount and whenever `deps` change.
 *
 * Every request is abortable, so switching filters or leaving a page quickly
 * cannot apply a stale response to the current view.
 */
export function useAsyncData<T>(
  loader: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
): AsyncState<T> & { reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [nonce, setNonce] = useState(0);

  // The loader is usually an inline closure; holding it in a ref keeps it out
  // of the dependency list so callers do not have to memoise it.
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    const run = async (): Promise<void> => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await loaderRef.current(controller.signal);
        if (!cancelled) setData(result);
      } catch (caught) {
        if (cancelled || (caught as Error).name === 'AbortError') return;
        setError(
          caught instanceof ApiError
            ? caught
            : new ApiError(0, {
                success: false,
                message: (caught as Error).message || 'Unexpected error',
                code: 'UNKNOWN',
              }),
        );
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { data, isLoading, error, reload };
}

/**
 * Wraps a one-shot action (create, update, delete) with pending/error state.
 *
 * Aborts in-flight work on unmount so a resolved promise never calls `setState`
 * on an unmounted component.
 */
export function useAction<Args extends unknown[], Result>(
  action: (...args: Args) => Promise<Result>,
): {
    run: (...args: Args) => Promise<Result | undefined>;
    isPending: boolean;
    error: ApiError | null;
    reset: () => void;
  } {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const mounted = useRef(true);

  const actionRef = useRef(action);
  actionRef.current = action;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const reset = useCallback(() => setError(null), []);

  const run = useCallback(async (...args: Args): Promise<Result | undefined> => {
    setIsPending(true);
    setError(null);
    try {
      const result = await actionRef.current(...args);
      return result;
    } catch (caught) {
      const apiError =
        caught instanceof ApiError
          ? caught
          : new ApiError(0, {
              success: false,
              message: (caught as Error).message || 'Unexpected error',
              code: 'UNKNOWN',
            });
      if (mounted.current) setError(apiError);
      return undefined;
    } finally {
      if (mounted.current) setIsPending(false);
    }
  }, []);

  return { run, isPending, error, reset };
}

/** Debounces a rapidly changing value (search boxes). */
export function useDebouncedValue<T>(value: T, delayMs = 350): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

/** Tracks a boolean in localStorage (filter/view preferences). */
export function usePersistentState<T>(
  key: string,
  initialValue: T,
): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(initialValue);

  useEffect(() => {
    const stored = window.localStorage.getItem(key);
    if (stored !== null) {
      try {
        setValue(JSON.parse(stored) as T);
      } catch {
        // Corrupt entry: fall back to the default rather than crashing.
      }
    }
    // Intentionally runs once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const update = useCallback(
    (next: T) => {
      setValue(next);
      window.localStorage.setItem(key, JSON.stringify(next));
    },
    [key],
  );

  return [value, update];
}