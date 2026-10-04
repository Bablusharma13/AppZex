import type { ApiErrorBody, ApiPaginated, ApiSuccess } from '@/types/api';

/**
 * Base URL of the REST API.
 *
 * Read from `NEXT_PUBLIC_API_URL` at build time so the same bundle can be
 * deployed against any backend. There is deliberately no hard-coded localhost
 * fallback in production: if the variable is missing the client fails loudly
 * rather than silently calling the wrong host.
 */
export const API_BASE_URL: string = process.env.NEXT_PUBLIC_API_URL ?? '';

/** Storage key for the in-flight super admin support session. */
export const SUPPORT_SESSION_KEY = 'appzex.supportSession';

/**
 * Typed operational error thrown by every service call.
 *
 * Carries the HTTP status and the per-field validation messages produced by the
 * backend's centralised error handler, so forms can highlight the exact inputs
 * that failed without re-parsing strings.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors: Record<string, string>;
  readonly requestId?: string;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message || 'Something went wrong');
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code ?? 'UNKNOWN';
    this.requestId = body.requestId;
    this.fieldErrors = (body.errors ?? []).reduce<Record<string, string>>(
      (acc, issue) => ({ ...acc, [issue.field]: issue.message }),
      {},
    );
  }

  /** True when the caller simply needs to sign in again. */
  get isUnauthenticated(): boolean {
    return this.status === 401;
  }

  /** True when the session is valid but the action is not permitted. */
  get isForbidden(): boolean {
    return this.status === 403;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  /** True when the failure is a validation problem the user can fix. */
  get isValidation(): boolean {
    return this.status === 422 || this.status === 400;
  }

  get isRateLimited(): boolean {
    return this.status === 429;
  }
}

export type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

/** Anything the client can send as a JSON body. */
export type JsonBody = object;

/** Values accepted in a query string. */
export type QueryValue = string | number | boolean | undefined | null;

/**
 * Query parameters. Declared without an index signature so typed list-query
 * objects (which lack one) are accepted directly, with no cast at the call site.
 */
export type QueryParams = object;

export interface RequestOptions {
  /**
   * JSON body. Typed objects are accepted without an index signature, so the
   * request DTOs can stay strongly typed at the call site.
   */
  body?: JsonBody;
  /** Multipart upload. Sent as-is and never JSON-encoded. */
  formData?: FormData;
  query?: QueryParams;
  /** Abort signal for cancellable list requests. */
  signal?: AbortSignal;
  /** Skip the `Authorization` header (login/register). */
  anonymous?: boolean;
}

/** Reads the access token from storage. */
export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem('appzex.accessToken');
}

/** Reads the current super admin support session id, if any. */
export function getSupportSessionId(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(SUPPORT_SESSION_KEY);
}

/** Clears the support session (called on sign out and when a session ends). */
export function clearSupportSession(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(SUPPORT_SESSION_KEY);
}

/** Builds a query string, dropping empty values so filters stay tidy. */
function buildQuery(query?: QueryParams): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query as Record<string, QueryValue>)) {
    if (value === undefined || value === null || value === '') continue;
    params.append(key, String(value));
  }
  const serialised = params.toString();
  return serialised ? `?${serialised}` : '';
}

/**
 * Parses an error response into a typed `ApiError`.
 *
 * A non-JSON body (proxy error page, gateway timeout) is handled too, so the UI
 * always has a readable message rather than a JSON parse exception.
 */
async function toApiError(response: Response): Promise<ApiError> {
  let body: ApiErrorBody;
  try {
    const parsed = (await response.json()) as Partial<ApiErrorBody>;
    body = {
      success: false,
      message: parsed.message ?? response.statusText ?? 'Request failed',
      code: parsed.code ?? 'UNKNOWN',
      errors: parsed.errors,
      requestId: parsed.requestId,
    };
  } catch {
    body = {
      success: false,
      message: response.statusText || `Request failed with status ${response.status}`,
      code: 'UNKNOWN',
    };
  }
  return new ApiError(response.status, body);
}

/** Notified when the session is rejected, so the app can sign the user out. */
type UnauthorizedHandler = () => void;
let unauthorizedHandler: UnauthorizedHandler | null = null;

export function onUnauthorized(handler: UnauthorizedHandler): void {
  unauthorizedHandler = handler;
}

/** Attaches auth + support-session headers to a request. */
function buildHeaders(options: RequestOptions): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' };

  if (!options.anonymous) {
    const token = getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    // Super admin support mode. The header value is only an opaque session id:
    // the backend re-reads the agency from the database on every request, so
    // this can never be used to widen access.
    const supportSessionId = getSupportSessionId();
    if (supportSessionId) headers['X-Support-Session'] = supportSessionId;
  }
  return headers;
}

/**
 * Same headers, for callers that perform their own `fetch` (file downloads).
 *
 * Exported so a download is authenticated exactly like any other call - there
 * is no unauthenticated file endpoint to fall back on.
 */
export function buildHeadersForRequest(): Record<string, string> {
  return buildHeaders({});
}

/** Runs the fetch and normalises transport/HTTP failures into `ApiError`. */
async function execute<T>(
  url: string,
  init: RequestInit,
  anonymous: boolean,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    // Network failure: the API is unreachable. Surfaced as a readable message
    // so forms can show something better than "Failed to fetch".
    if ((error as Error).name === 'AbortError') throw error;
    throw new ApiError(0, {
      success: false,
      message: 'Cannot reach the server. Check your connection and try again.',
      code: 'NETWORK_ERROR',
    });
  }

  if (!response.ok) {
    const apiError = await toApiError(response);
    // A rejected session must not leave the UI in a half-authenticated state.
    if (apiError.isUnauthenticated && !anonymous) unauthorizedHandler?.();
    throw apiError;
  }

  if (response.status === 204) return undefined as T;
  const json = (await response.json()) as ApiSuccess<T>;
  return json.data;
}

async function request<T>(
  method: Method,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const headers = buildHeaders(options);
  let payload: BodyInit | undefined;

  if (options.formData) {
    // Let the browser set the multipart boundary.
    payload = options.formData;
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(options.body);
  }

  return execute<T>(
    `${API_BASE_URL}${path}${buildQuery(options.query)}`,
    { method, headers, body: payload, signal: options.signal, cache: 'no-store', credentials: 'include' },
    Boolean(options.anonymous),
  );
}

/** GET that unwraps `{ success, data }`. */
export function apiGet<T>(path: string, options?: RequestOptions): Promise<T> {
  return request<T>('GET', path, options);
}

/** GET that returns the items plus the pagination block. */
export async function apiGetPaginated<T>(
  path: string,
  options?: RequestOptions,
): Promise<ApiPaginated<T>['pagination'] & { items: T[] }> {
  const url = `${API_BASE_URL}${path}${buildQuery(options?.query)}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: buildHeaders(options ?? {}),
    signal: options?.signal,
    cache: 'no-store',
    credentials: 'include',
  });

  if (!response.ok) {
    const apiError = await toApiError(response);
    if (apiError.isUnauthenticated) unauthorizedHandler?.();
    throw apiError;
  }

  const json = (await response.json()) as ApiPaginated<T>;
  return { ...json.pagination, items: json.data };
}

export function apiPost<T>(path: string, options?: RequestOptions): Promise<T> {
  return request<T>('POST', path, options);
}

export function apiPatch<T>(path: string, options?: RequestOptions): Promise<T> {
  return request<T>('PATCH', path, options);
}

export function apiPut<T>(path: string, options?: RequestOptions): Promise<T> {
  return request<T>('PUT', path, options);
}

export function apiDelete<T>(path: string, options?: RequestOptions): Promise<T> {
  return request<T>('DELETE', path, options);
}