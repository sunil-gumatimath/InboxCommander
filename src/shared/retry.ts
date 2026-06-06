/**
 * shared/retry.ts
 * Exponential backoff helper. Use for any transient-failure-prone network call.
 */

export interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  isRetryable: (err: unknown) => boolean;
  onRetry?: (attempt: number, delayMs: number, err: unknown) => void;
}

export async function withBackoff<T>(
  fn: (attempt: number) => Promise<T>,
  opts: RetryOptions,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      if (!opts.isRetryable(err) || attempt === opts.maxRetries) {
        throw err;
      }
      const delayMs = Math.min(opts.baseDelayMs * 2 ** attempt, opts.maxDelayMs);
      opts.onRetry?.(attempt + 1, delayMs, err);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  // Unreachable — the loop either returns or throws — but TS needs it.
  throw lastErr;
}

/** Convenience predicate for HTTP transient errors. */
export const isTransientHttp = (err: unknown): boolean => {
  const status = (err as { status?: number })?.status;
  return status === 429 || (typeof status === 'number' && status >= 500);
};
