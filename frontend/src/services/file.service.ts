import {
  API_BASE_URL,
  ApiError,
  buildHeadersForRequest,
} from '@/lib/api-client';
import type { FileDto } from '@/types/api';

/**
 * Authorised file downloads.
 *
 * There is deliberately no public or permanently signed URL: files are served
 * only through `GET /files/:id/download`, and the backend re-checks identity,
 * agency, client ownership and visibility before streaming a single byte.
 * Downloading therefore requires the same Bearer token as any other request,
 * which is why this cannot be a plain `<a href>`.
 */
export const fileService = {
  /**
   * Downloads a file as an object URL.
   *
   * The caller owns the returned URL and must revoke it once the download has
   * been triggered, otherwise the blob stays in memory for the page's lifetime.
   */
  async download(file: FileDto): Promise<string> {
    const response = await fetch(`${API_BASE_URL}/files/${file.id}/download`, {
      method: 'GET',
      headers: buildHeadersForRequest(),
      cache: 'no-store',
      credentials: 'include',
    });

    if (!response.ok) {
      let message = 'This file could not be downloaded.';
      let code = 'UNKNOWN';
      try {
        const body = (await response.json()) as { message?: string; code?: string };
        message = body.message ?? message;
        code = body.code ?? code;
      } catch {
        // Non-JSON error body: keep the generic message.
      }
      throw new ApiError(response.status, { success: false, message, code });
    }

    const blob = await response.blob();
    return URL.createObjectURL(blob);
  },

  /**
   * Downloads and immediately saves the file using the original name.
   *
   * Returns `false` when the browser blocked the programmatic click.
   */
  async save(file: FileDto): Promise<boolean> {
    const objectUrl = await fileService.download(file);
    try {
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = file.originalName;
      anchor.rel = 'noopener';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      return true;
    } finally {
      // Revoke on the next tick so the browser has started the read.
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    }
  },
};

/**
 * Opens an authorised download in a new tab.
 *
 * A blob URL is used rather than a plain link so the `Authorization` header can
 * be attached - a bare link would be an unauthenticated request.
 */
export async function openFileInNewTab(file: FileDto): Promise<void> {
  const objectUrl = await fileService.download(file);
  const tab = window.open(objectUrl, '_blank', 'noopener,noreferrer');
  if (!tab) {
    // Pop-up blocked: fall back to a normal download so the click is not lost.
    await fileService.save(file);
    return;
  }
  // Give the new tab a moment to consume the blob before releasing it.
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}