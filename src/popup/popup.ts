/**
 * popup/popup.ts
 * Quick-access popup logic
 */

import { MESSAGE_TYPES } from '../shared/constants';
import { applyStoredTheme } from '../shared/utils';
import { sendToBackground } from '../shared/messaging';

const $ = <T extends Element = HTMLElement>(sel: string): T | null => document.querySelector<T>(sel);

const dom = {
  get connectionDot() { return $('#connectionDot'); },
  get statusText() { return $('#statusText'); },
  get userEmail() { return $('#userEmail'); },
  get statsSection() { return $('#statsSection'); },
  get unreadCount() { return $('#unreadCount'); },
  get pendingCount() { return $('#pendingCount'); },
  get actionsGrid() { return $('#actionsGrid'); },
  get authSection() { return $('#authSection'); },
  get authBtn() { return $('#authBtn') as HTMLButtonElement | null; },
  get btnSummarize() { return $('#btnSummarize') as HTMLButtonElement | null; },
  get btnSummarizeCurrent() { return $('#btnSummarizeCurrent') as HTMLButtonElement | null; },
  get btnPriority() { return $('#btnPriority') as HTMLButtonElement | null; },
  get btnOpenPanel() { return $('#btnOpenPanel') as HTMLButtonElement | null; },
  get settingsBtn() { return $('#settingsBtn') as HTMLButtonElement | null; },
  get optionsLink() { return $('#optionsLink'); },
};

interface GmailContextSnapshot {
  view: 'inbox' | 'thread' | 'compose' | null;
  threadId: string | null;
  emailId: string | null;
  url?: string;
}

async function initPopup(): Promise<void> {
  await applyStoredTheme();
  setupEventListeners();
  await checkAuthStatus();
  await detectOpenEmail();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPopup);
} else {
  initPopup();
}

async function checkAuthStatus(): Promise<void> {
  try {
    const response = await sendToBackground({ type: MESSAGE_TYPES.AUTH_STATUS });
    updateAuthUI(response?.authenticated ?? false, response?.email);
  } catch {
    updateAuthUI(false);
  }
}

function updateAuthUI(authenticated: boolean, email?: string | null): void {
  if (authenticated) {
    dom.connectionDot?.classList.add('connected');
    dom.connectionDot?.setAttribute('aria-label', `Connected${email ? `: ${email}` : ''}`);
    if (dom.statusText) dom.statusText.textContent = 'Connected';
    if (dom.userEmail) {
      dom.userEmail.textContent = email ?? '';
      dom.userEmail.hidden = !email;
    }
    if (dom.statsSection) dom.statsSection.hidden = false;
    if (dom.actionsGrid) dom.actionsGrid.hidden = false;
    if (dom.authSection) dom.authSection.hidden = true;

    // Fetch stats for the stat badges
    fetchPendingApprovalsCount();
    fetchUnreadCount();
  } else {
    dom.connectionDot?.classList.remove('connected');
    dom.connectionDot?.setAttribute('aria-label', 'Not connected');
    if (dom.statusText) dom.statusText.textContent = 'Not connected';
    if (dom.userEmail) dom.userEmail.hidden = true;
    if (dom.statsSection) dom.statsSection.hidden = true;
    if (dom.actionsGrid) dom.actionsGrid.hidden = true;
    if (dom.authSection) dom.authSection.hidden = false;
  }
}

async function fetchPendingApprovalsCount(): Promise<void> {
  try {
    const response = await sendToBackground({ type: MESSAGE_TYPES.GET_PENDING_APPROVALS });
    const count = response?.approvals?.length ?? 0;
    if (dom.pendingCount) dom.pendingCount.textContent = String(count);
  } catch {
    // Ignore
  }
}

async function fetchUnreadCount(): Promise<void> {
  try {
    const response = await sendToBackground({ type: MESSAGE_TYPES.GET_UNREAD_COUNT });
    const count = response?.count ?? 0;
    if (dom.unreadCount) dom.unreadCount.textContent = String(count);
  } catch {
    // Ignore
  }
}

/**
 * Query the active Gmail tab for the email currently open (if any) and toggle
 * the "Summarize This Email" button accordingly. Stays disabled with an
 * explanatory tooltip when there's no open email.
 */
async function detectOpenEmail(): Promise<void> {
  if (!dom.btnSummarizeCurrent) return;

  const setButtonState = (
    enabled: boolean,
    tooltip: string,
  ): void => {
    dom.btnSummarizeCurrent!.disabled = !enabled;
    dom.btnSummarizeCurrent!.title = tooltip;
  };

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url?.includes('mail.google.com')) {
      setButtonState(false, 'Open Gmail and select an email to enable');
      return;
    }

    try {
      const ctx = (await chrome.tabs.sendMessage(tab.id, {
        type: 'GET_CURRENT_CONTEXT',
      })) as GmailContextSnapshot | undefined;

      if (ctx?.view === 'thread' && (ctx.emailId || ctx.threadId)) {
        setButtonState(true, 'Summarize the email currently open in Gmail');
      } else {
        setButtonState(false, 'Open an email in Gmail to enable');
      }
    } catch (msgErr) {
      console.warn('[InboxCommander] Failed to communicate with content script:', msgErr);
      setButtonState(false, 'Please refresh Gmail to enable');
    }
  } catch (err) {
    console.error('[InboxCommander] Error querying active tab:', err);
    setButtonState(false, 'Open an email in Gmail to enable');
  }
}

function setupEventListeners(): void {
  dom.authBtn?.addEventListener('click', async () => {
    if (!dom.authBtn) return;
    try {
      dom.authBtn.disabled = true;
      dom.authBtn.textContent = 'Connecting...';
      const response = await sendToBackground({ type: MESSAGE_TYPES.AUTH_LOGIN });
      if (response && !response.error) {
        updateAuthUI(true, response.email);
      } else {
        alert(response?.error ?? 'Authentication failed');
      }
    } finally {
      dom.authBtn.disabled = false;
      dom.authBtn.textContent = 'Sign in with Google';
    }
  });

  dom.btnOpenPanel?.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (!activeTab || activeTab.id === undefined) return;

      if (chrome.sidePanel && typeof chrome.sidePanel.open === 'function') {
        chrome.sidePanel.open({ tabId: activeTab.id })
          .then(() => {
            if (!activeTab.url?.includes('mail.google.com')) {
              chrome.tabs.update(activeTab.id, { url: 'https://mail.google.com' });
            }
            window.close();
          })
          .catch((e) => {
            console.error('[InboxCommander] Failed to open side panel:', e);
            window.close();
          });
      } else {
        window.close();
      }
    });
  });

  const triggerChatAction = async (
    actionText: string,
    emailContext: GmailContextSnapshot | null = null,
  ): Promise<void> => {
    try {
      const payload: Record<string, unknown> = { pendingQuickAction: actionText };
      if (emailContext) payload.pendingEmailContext = emailContext;
      await chrome.storage.session.set(payload);
    } catch {
      // session storage is optional; the side panel will fall back to message passing
    }

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (!activeTab || activeTab.id === undefined) return;

      if (chrome.sidePanel && typeof chrome.sidePanel.open === 'function') {
        chrome.sidePanel.open({ tabId: activeTab.id })
          .then(() => {
            if (!activeTab.url?.includes('mail.google.com')) {
              chrome.tabs.update(activeTab.id, { url: 'https://mail.google.com' });
            } else {
              chrome.runtime.sendMessage({
                type: 'TRIGGER_QUICK_ACTION',
                action: actionText
              }).catch(() => {});
            }
            window.close();
          })
          .catch((e) => {
            console.error('[InboxCommander] Failed to open side panel:', e);
            window.close();
          });
      } else {
        window.close();
      }
    });
  };

  dom.btnSummarize?.addEventListener('click', () => triggerChatAction('SUMMARIZE_INBOX'));
  dom.btnPriority?.addEventListener('click', () => triggerChatAction('PRIORITY_EMAILS'));

  dom.btnSummarizeCurrent?.addEventListener('click', async () => {
    if (dom.btnSummarizeCurrent?.disabled) return;

    // Re-query so the context is as fresh as the user's click — Gmail may have
    // navigated between popup open and click.
    let ctx: GmailContextSnapshot | null = null;
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id && tab.url?.includes('mail.google.com')) {
        const raw = (await chrome.tabs.sendMessage(tab.id, {
          type: 'GET_CURRENT_CONTEXT',
        })) as GmailContextSnapshot | undefined;
        if (raw && raw.view === 'thread' && (raw.emailId || raw.threadId)) {
          ctx = raw;
        }
      }
    } catch {
      ctx = null;
    }

    if (!ctx) {
      alert('Please open an email in Gmail first.');
      return;
    }

    await triggerChatAction('SUMMARIZE_EMAIL', ctx);
  });

  dom.settingsBtn?.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  dom.optionsLink?.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
}


