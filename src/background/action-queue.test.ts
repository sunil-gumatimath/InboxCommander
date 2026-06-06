import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

const store = new Map<string, unknown>();
const chromeMock = {
  storage: {
    local: {
      get: vi.fn(async (key: string | string[]) => {
        const keys = Array.isArray(key) ? key : [key];
        const out: Record<string, unknown> = {};
        for (const k of keys) {
          if (store.has(k)) out[k] = store.get(k);
        }
        return out;
      }),
      set: vi.fn(async (items: Record<string, unknown>) => {
        for (const [k, v] of Object.entries(items)) store.set(k, v);
      }),
      remove: vi.fn(async (key: string) => {
        store.delete(key);
      }),
    },
  },
};

// In-memory gmail-api stub. Default throws so unstubbed calls surface failures.
const gmailApiMock = {
  sendMessage: vi.fn(async () => ({ id: 'sent' })),
  trashMessage: vi.fn(async () => ({ id: 'trashed' })),
  archiveMessage: vi.fn(async () => ({ id: 'archived' })),
  labelMessage: vi.fn(async () => ({ id: 'labeled' })),
  markAsRead: vi.fn(async () => ({ id: 'read' })),
  batchModify: vi.fn(async () => ({ count: 0 })),
  createDraft: vi.fn(async () => ({ id: 'draft' })),
  starMessage: vi.fn(async () => ({ id: 'starred' })),
  unstarMessage: vi.fn(async () => ({ id: 'unstarred' })),
};

vi.mock('./gmail-api', () => gmailApiMock);

describe('action-queue', () => {
  beforeAll(async () => {
    (globalThis as unknown as { chrome: unknown }).chrome = chromeMock;
    // Pre-load modules so they pick up the chrome mock.
    await import('./action-queue');
  });

  afterAll(() => {
    delete (globalThis as unknown as { chrome?: unknown }).chrome;
  });

  describe('queueAction', () => {
    it('queues a HIGH-risk action and does NOT execute', async () => {
      store.clear();
      const { queueAction, getPendingActions } = await import('./action-queue');
      gmailApiMock.sendMessage.mockClear();
      const action = await queueAction({
        type: 'SEND_EMAIL',
        params: { raw: 'abc' },
        riskLevel: 'HIGH',
      });
      expect(action.status).toBe('pending');
      expect(action.type).toBe('SEND_EMAIL');
      expect(gmailApiMock.sendMessage).not.toHaveBeenCalled();
      const pending = await getPendingActions();
      expect(pending).toHaveLength(1);
      expect(pending[0]?.id).toBe(action.id);
    });

    it('auto-executes a LOW-risk action when approval not required', async () => {
      store.clear();
      await store.set('extension_settings', {
        approvalRequired: { low: false, medium: true, high: true },
      });
      gmailApiMock.markAsRead.mockClear();
      const { queueAction, getPendingActions } = await import('./action-queue');
      const action = await queueAction({
        type: 'MARK_READ',
        params: { messageId: 'm1' },
        riskLevel: 'LOW',
      });
      expect(action.status).toBe('executed');
      expect(gmailApiMock.markAsRead).toHaveBeenCalledWith('m1');
      const pending = await getPendingActions();
      expect(pending).toHaveLength(0);
    });

    it('records failures in the log with status=failed', async () => {
      store.clear();
      gmailApiMock.trashMessage.mockRejectedValueOnce(new Error('boom'));
      const { queueAction, approveAction, getActionLog } = await import('./action-queue');
      const action = await queueAction({
        type: 'TRASH_EMAIL',
        params: { messageId: 'm1' },
        riskLevel: 'HIGH',
      });
      const approved = await approveAction(action.id);
      expect(approved.status).toBe('failed');
      const log = await getActionLog();
      expect(log[0]?.status).toBe('failed');
    });
  });

  describe('approveAction', () => {
    it('throws when action id not found', async () => {
      store.clear();
      const { approveAction } = await import('./action-queue');
      await expect(approveAction('nonexistent')).rejects.toThrow(/not found/);
    });

    it('approves a pending action and removes it from pending', async () => {
      store.clear();
      gmailApiMock.archiveMessage.mockClear();
      const { queueAction, approveAction, getPendingActions } = await import('./action-queue');
      const action = await queueAction({
        type: 'ARCHIVE_EMAIL',
        params: { messageId: 'm1' },
        riskLevel: 'MEDIUM',
      });
      const approved = await approveAction(action.id);
      expect(approved.status).toBe('executed');
      expect(gmailApiMock.archiveMessage).toHaveBeenCalledWith('m1');
      expect(await getPendingActions()).toHaveLength(0);
    });
  });

  describe('rejectAction', () => {
    it('removes from pending and appends to log with status=rejected', async () => {
      store.clear();
      const { queueAction, rejectAction, getPendingActions, getActionLog } =
        await import('./action-queue');
      const action = await queueAction({
        type: 'ARCHIVE_EMAIL',
        params: { messageId: 'm1' },
        riskLevel: 'MEDIUM',
      });
      await rejectAction(action.id);
      expect(await getPendingActions()).toHaveLength(0);
      const log = await getActionLog();
      expect(log[0]?.status).toBe('rejected');
    });
  });

  describe('editAction', () => {
    it('updates reason, params (merged), and riskLevel in place', async () => {
      store.clear();
      const { queueAction, editAction, getPendingActions } = await import('./action-queue');
      const action = await queueAction({
        type: 'LABEL_EMAIL',
        params: { messageId: 'm1', labelId: 'old' },
        reason: 'old reason',
        riskLevel: 'MEDIUM',
      });
      const edited = await editAction(action.id, {
        reason: 'new reason',
        params: { labelId: 'new' },
        riskLevel: 'HIGH',
      });
      expect(edited.reason).toBe('new reason');
      expect(edited.params.labelId).toBe('new');
      expect(edited.params.messageId).toBe('m1'); // merged, not replaced
      expect(edited.riskLevel).toBe('HIGH');
      const pending = await getPendingActions();
      expect(pending[0]?.id).toBe(action.id);
    });

    it('throws when action id not found', async () => {
      store.clear();
      const { editAction } = await import('./action-queue');
      await expect(editAction('nope')).rejects.toThrow(/not found/);
    });
  });

  describe('clearActionLog', () => {
    it('empties the log', async () => {
      store.clear();
      const { queueAction, rejectAction, clearActionLog, getActionLog } =
        await import('./action-queue');
      const a = await queueAction({
        type: 'TRASH_EMAIL',
        params: { messageId: 'm1' },
        riskLevel: 'MEDIUM',
      });
      await rejectAction(a.id);
      // queueAction + rejectAction each append one entry → 2 total
      expect(await getActionLog()).toHaveLength(2);
      await clearActionLog();
      expect(await getActionLog()).toHaveLength(0);
    });
  });
});
