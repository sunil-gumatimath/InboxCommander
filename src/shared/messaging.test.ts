import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

const sendMessage = vi.fn();
let lastError: { message: string } | null = null;

function setResponse(response: unknown) {
  lastError = null;
  sendMessage.mockImplementation((_msg: unknown, cb: (r: unknown) => void) => {
    cb(response);
  });
}

function setError(message: string) {
  lastError = { message };
  sendMessage.mockImplementation((_msg: unknown, cb: (r: unknown) => void) => {
    cb(undefined);
  });
}

const chromeMock = {
  runtime: {
    get sendMessage() {
      return sendMessage;
    },
    get lastError() {
      return lastError;
    },
  },
};

describe('shared/messaging', () => {
  beforeAll(() => {
    (globalThis as unknown as { chrome: unknown }).chrome = chromeMock;
  });

  afterAll(() => {
    delete (globalThis as unknown as { chrome?: unknown }).chrome;
  });

  it('sendToBackground wraps message in {type, data} and unwraps response', async () => {
    setResponse({ success: true, data: { foo: 1 }, error: null, timestamp: 0 });
    const { sendToBackground } = await import('./messaging');
    const result = await sendToBackground({ type: 'TEST', payload: 'x' });
    expect(sendMessage).toHaveBeenCalledWith(
      { type: 'TEST', data: { payload: 'x' } },
      expect.any(Function),
    );
    expect(result).toEqual({ foo: 1 });
  });

  it('resolves with { error } on business-logic failure', async () => {
    setResponse({ success: false, data: null, error: 'bad', timestamp: 0 });
    const { sendToBackground } = await import('./messaging');
    const result = await sendToBackground({ type: 'TEST' });
    expect(result).toEqual({ error: 'bad' });
  });

  it('rejects on chrome.runtime.lastError', async () => {
    setError('disconnected');
    const { sendToBackground } = await import('./messaging');
    await expect(sendToBackground({ type: 'TEST' })).rejects.toThrow('disconnected');
  });

  it('passes through unrecognized response shape as-is', async () => {
    setResponse({ random: 'shape' });
    const { sendToBackground } = await import('./messaging');
    const result = await sendToBackground({ type: 'TEST' });
    expect(result).toEqual({ random: 'shape' });
  });
});
