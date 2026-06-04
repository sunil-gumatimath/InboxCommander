/**
 * popup/popup.ts
 * Quick-access popup logic
 */

import { MESSAGE_TYPES } from '../shared/constants';
import { applyStoredTheme } from '../shared/utils';

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
  get btnPriority() { return $('#btnPriority') as HTMLButtonElement | null; },
  get btnOpenPanel() { return $('#btnOpenPanel') as HTMLButtonElement | null; },
  get settingsBtn() { return $('#settingsBtn') as HTMLButtonElement | null; },
  get optionsLink() { return $('#optionsLink'); },
};

async function initPopup(): Promise<void> {
  await applyStoredTheme();
  setupEventListeners();
  await checkAuthStatus();
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

  const triggerChatAction = async (actionText: string): Promise<void> => {
    try {
      await chrome.storage.session.set({ pendingQuickAction: actionText });
    } catch (e) {}

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

  dom.settingsBtn?.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  dom.optionsLink?.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
}

function sendToBackground(message: any): Promise<any> {
  const { type, ...rest } = message;
  const wrappedMessage = {
    type,
    data: rest
  };
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(wrappedMessage, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (response && typeof response === 'object' && 'success' in response) {
        if (response.success) {
          resolve(response.data);
        } else {
          resolve({ error: response.error || 'Unknown error' });
        }
      } else {
        resolve(response);
      }
    });
  });
}
