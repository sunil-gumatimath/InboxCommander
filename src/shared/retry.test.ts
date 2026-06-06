import { describe, it, expect, vi } from 'vitest';
import { withBackoff } from './retry';

describe('withBackoff', () => {
  it('returns the result on first success', async () => {
    const fn = vi.fn(async () => 'ok');
    const result = await withBackoff(fn, {
      maxRetries: 3,
      baseDelayMs: 1,
      maxDelayMs: 10,
      isRetryable: () => false,
    });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on retryable status and eventually succeeds', async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls++;
      if (calls < 3) {
        const err = new Error('boom') as Error & { status?: number };
        err.status = 503;
        throw err;
      }
      return 'ok';
    });
    const result = await withBackoff(fn, {
      maxRetries: 5,
      baseDelayMs: 1,
      maxDelayMs: 10,
      isRetryable: (e) =>
        (e as { status?: number }).status === 503 || (e as { status?: number }).status === 429,
    });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws immediately on non-retryable error', async () => {
    const fn = vi.fn(async () => {
      const err = new Error('fatal') as Error & { status?: number };
      err.status = 400;
      throw err;
    });
    await expect(
      withBackoff(fn, {
        maxRetries: 3,
        baseDelayMs: 1,
        maxDelayMs: 10,
        isRetryable: (e) => (e as { status?: number }).status === 503,
      }),
    ).rejects.toThrow('fatal');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('throws after exhausting retries', async () => {
    const fn = vi.fn(async () => {
      const err = new Error('always fails') as Error & { status?: number };
      err.status = 503;
      throw err;
    });
    await expect(
      withBackoff(fn, {
        maxRetries: 2,
        baseDelayMs: 1,
        maxDelayMs: 10,
        isRetryable: (e) => (e as { status?: number }).status === 503,
      }),
    ).rejects.toThrow('always fails');
    expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });
});
