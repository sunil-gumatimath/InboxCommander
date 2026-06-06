import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const store = new Map<string, unknown>();
const chromeMock = {
  storage: {
    local: {
      get: async (key: string | string[]) => {
        const keys = Array.isArray(key) ? key : [key];
        const out: Record<string, unknown> = {};
        for (const k of keys) if (store.has(k)) out[k] = store.get(k);
        return out;
      },
      set: async (items: Record<string, unknown>) => {
        for (const [k, v] of Object.entries(items)) store.set(k, v);
      },
      remove: async (key: string) => {
        store.delete(key);
      },
    },
  },
};

describe('shared/storage', () => {
  beforeAll(() => {
    (globalThis as unknown as { chrome: unknown }).chrome = chromeMock;
  });

  afterAll(() => {
    delete (globalThis as unknown as { chrome?: unknown }).chrome;
  });

  it('getSettings returns DEFAULT_SETTINGS when nothing stored', async () => {
    const { getSettings } = await import('./storage');
    const settings = await getSettings();
    expect(settings.geminiModel).toBeTruthy();
    expect(settings.approvalRequired).toBeDefined();
  });

  it('getSettings merges stored settings over defaults', async () => {
    store.set('extension_settings', { geminiModel: 'gemini-2.5-pro' });
    const { getSettings } = await import('./storage');
    const settings = await getSettings();
    expect(settings.geminiModel).toBe('gemini-2.5-pro');
    expect(settings.approvalRequired).toBeDefined();
  });

  it('updateSettings merges and persists', async () => {
    const { updateSettings, getSettings } = await import('./storage');
    await updateSettings({ writingTone: 'casual' });
    const settings = await getSettings();
    expect(settings.writingTone).toBe('casual');
  });

  it('getApiKey returns null when not set', async () => {
    store.delete('geminiApiKey');
    const { getApiKey } = await import('./storage');
    expect(await getApiKey()).toBeNull();
  });

  it('getApiKey returns stored key', async () => {
    store.set('geminiApiKey', 'test-key');
    const { getApiKey } = await import('./storage');
    expect(await getApiKey()).toBe('test-key');
  });

  it('getActionLog returns empty array when not set', async () => {
    store.delete('actionQueue_log');
    const { getActionLog } = await import('./storage');
    expect(await getActionLog(50)).toEqual([]);
  });
});
