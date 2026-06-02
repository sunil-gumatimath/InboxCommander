/**
 * MailFlow-agent — Side Panel Logic
 * Main AI chat interface controller
 */

import { MESSAGE_TYPES, RISK_LEVELS, ACTION_STATUS } from '../shared/constants';
import type { ConversationTurn, EmailContext, QueuedAction } from '../shared/types';
import { applyStoredTheme } from '../shared/utils';

// ─── DOM References ──────────────────────────────────────────────
const $ = <T extends Element = HTMLElement>(sel: string): T | null => document.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string): NodeListOf<T> => document.querySelectorAll<T>(sel);

const dom = {
  get connectionDot() { return $('#connectionDot'); },
  get settingsBtn() { return $('#settingsBtn') as HTMLButtonElement | null; },
  get authSection() { return $('#authSection'); },
  get authBtn() { return $('#authBtn') as HTMLButtonElement | null; },
  get mainContent() { return $('#mainContent'); },
  get chatInput() { return $('#chatInput') as HTMLTextAreaElement | null; },
  get sendBtn() { return $('#sendBtn') as HTMLButtonElement | null; },
  get chatMessages() { return $('#chatMessages'); },
  get quickActions() { return $('#quickActions'); },
  get emailContext() { return $('#emailContext'); },
  get ctxFrom() { return $('#ctxFrom'); },
  get ctxSubject() { return $('#ctxSubject'); },
  get ctxPriority() { return $('#ctxPriority'); },
  get ctxCategory() { return $('#ctxCategory'); },
  get approvalsSection() { return $('#approvalsSection'); },
  get approvalCount() { return $('#approvalCount'); },
  get approvalsList() { return $('#approvalsList'); },
  get historySection() { return $('#historySection'); },
  get historyList() { return $('#historyList'); },
  get toastContainer() { return $('#toastContainer'); },
  get clearChatBtn() { return $('#clearChatBtn') as HTMLButtonElement | null; },
};

// ─── State ───────────────────────────────────────────────────────
let conversationHistory: ConversationTurn[] = [];
let currentEmailContext: EmailContext | null = null;
let isWaitingForResponse = false;

// ─── Initialization ──────────────────────────────────────────────
async function initSidepanel(): Promise<void> {
  await applyStoredTheme();
  setupEventListeners();
  setupCollapsibleSections();
  await checkAuthStatus();
  await loadConversationHistory();
  await checkPendingQuickAction();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSidepanel);
} else {
  initSidepanel();
}

async function checkPendingQuickAction(): Promise<void> {
  try {
    const { pendingQuickAction } = (await chrome.storage.session.get('pendingQuickAction')) as { pendingQuickAction?: string };
    if (pendingQuickAction) {
      await chrome.storage.session.remove('pendingQuickAction');
      setTimeout(() => {
        handleQuickAction(pendingQuickAction);
      }, 500);
    }
  } catch (e) {}
}

// ─── Auth ────────────────────────────────────────────────────────
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
    if (dom.authSection) dom.authSection.hidden = true;
    if (dom.mainContent) dom.mainContent.hidden = false;
    dom.connectionDot?.classList.add('connected');
    if (dom.connectionDot) {
      dom.connectionDot.title = `Connected: ${email ?? 'Gmail'}`;
    }
    fetchPendingApprovals();
    fetchActionHistory();
  } else {
    if (dom.authSection) dom.authSection.hidden = false;
    if (dom.mainContent) dom.mainContent.hidden = true;
    dom.connectionDot?.classList.remove('connected');
    if (dom.connectionDot) {
      dom.connectionDot.title = 'Not connected';
    }
  }
}

async function handleLogin(): Promise<void> {
  if (!dom.authBtn) return;
  try {
    dom.authBtn.disabled = true;
    dom.authBtn.textContent = 'Connecting...';
    const response = await sendToBackground({ type: MESSAGE_TYPES.AUTH_LOGIN });
    if (response && !response.error) {
      updateAuthUI(true, response.email);
      showToast('Connected to Gmail!', 'success');
    } else {
      showToast(response?.error ?? 'Authentication failed', 'error');
    }
  } catch (err) {
    showToast('Connection failed. Please try again.', 'error');
  } finally {
    dom.authBtn.disabled = false;
    dom.authBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
      Connect to Gmail`;
  }
}

// ─── Chat ────────────────────────────────────────────────────────
async function handleSendMessage(): Promise<void> {
  if (!dom.chatInput || !dom.sendBtn) return;
  const text = dom.chatInput.value.trim();
  if (!text || isWaitingForResponse) return;

  // Add user message
  addMessage('user', text);
  dom.chatInput.value = '';
  autoResizeTextarea();
  isWaitingForResponse = true;
  dom.sendBtn.disabled = true;

  // Show loading
  const loadingEl = showLoadingIndicator();

  try {
    const payload = {
      type: MESSAGE_TYPES.CHAT,
      message: text,
      emailContext: currentEmailContext ?? null,
      conversationHistory: conversationHistory.slice(-10),
    };

    const response = await sendToBackground(payload);
    loadingEl.remove();

    if (response?.error) {
      addMessage('agent', `⚠️ ${response.error}`);
    } else {
      addMessage('agent', response?.reply ?? 'I couldn\'t process that request. Please try again.');
      // Render action suggestions if present
      if (response?.actions?.length) {
        renderActionSuggestions(response.actions);
      }
    }
  } catch (err) {
    loadingEl.remove();
    addMessage('agent', '😔 Something went wrong. Please try again.');
  } finally {
    isWaitingForResponse = false;
    dom.sendBtn.disabled = false;
  }
}

function addMessage(role: string, text: string): void {
  const timestamp = formatTime(new Date());
  conversationHistory.push({ role, text, timestamp });

  const messageEl = document.createElement('div');
  messageEl.className = `message message--${role} fade-in`;
  messageEl.innerHTML = `
    <div class="message__avatar">
      ${role === 'user'
        ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'
        : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>'
      }
    </div>
    <div class="message__content">
      <div class="message__role">${role === 'user' ? 'You' : 'MailFlow-agent'}</div>
      <div class="message__text">${escapeHtml(text)}</div>
      <div class="message__time">${timestamp}</div>
    </div>
  `;

  if (dom.chatMessages) {
    dom.chatMessages.appendChild(messageEl);
    dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
  }

  // Persist to session storage
  saveConversationHistory();
}

function showLoadingIndicator(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'message message--agent loading-indicator';
  el.innerHTML = `
    <div class="message__avatar">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
    </div>
    <div class="message__content">
      <div class="loading-dots"><span></span><span></span><span></span></div>
    </div>
  `;
  if (dom.chatMessages) {
    dom.chatMessages.appendChild(el);
    dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
  }
  return el;
}

interface ActionSuggestion {
  title: string;
  type: string;
  description: string;
  payload: any;
}

function renderActionSuggestions(actions: ActionSuggestion[]): void {
  if (!dom.chatMessages) return;
  const lastAgentMsg = dom.chatMessages.querySelector('.message--agent:last-child .message__content');
  if (!lastAgentMsg) return;

  actions.forEach((action) => {
    const card = document.createElement('div');
    card.className = 'action-card';
    card.innerHTML = `
      <div class="action-card__title">${escapeHtml(action.title ?? action.type)}</div>
      <div class="action-card__desc">${escapeHtml(action.description ?? '')}</div>
    `;
    card.addEventListener('click', () => {
      sendToBackground({ type: action.type, ...action.payload });
      showToast(`Action "${action.title}" triggered`, 'info');
    });
    lastAgentMsg.appendChild(card);
  });
}

// ─── Quick Actions ───────────────────────────────────────────────
function handleQuickAction(actionType: string): void {
  if (!dom.chatInput) return;
  const labels: Record<string, string> = {
    SUMMARIZE_INBOX: 'Summarize my inbox',
    PRIORITY_EMAILS: 'Show priority emails',
    UNREAD_EMAILS: 'Show unread emails',
    DRAFT_REPLY: 'Draft a reply',
  };

  const text = labels[actionType] ?? actionType;
  dom.chatInput.value = text;
  handleSendMessage();
}

// ─── Email Context ───────────────────────────────────────────────
function updateEmailContext(context: EmailContext | null): void {
  currentEmailContext = context;

  if (!context) {
    if (dom.emailContext) dom.emailContext.hidden = true;
    return;
  }

  if (dom.emailContext) dom.emailContext.hidden = false;
  if (dom.ctxFrom) dom.ctxFrom.textContent = context.from ?? '—';
  if (dom.ctxSubject) dom.ctxSubject.textContent = context.subject ?? '—';

  const priority = context.priority ?? 'NORMAL';
  if (dom.ctxPriority) {
    dom.ctxPriority.textContent = priority;
    (dom.ctxPriority as HTMLElement).dataset.priority = priority;
  }

  const category = context.category ?? 'WORK';
  if (dom.ctxCategory) {
    dom.ctxCategory.textContent = category;
    (dom.ctxCategory as HTMLElement).dataset.category = category;
  }
}

function handleContextAction(actionType: string): void {
  if (!currentEmailContext) {
    showToast('No email selected', 'warning');
    return;
  }

  const payload = {
    type: (MESSAGE_TYPES as Record<string, string>)[actionType],
    emailId: currentEmailContext.emailId,
    threadId: currentEmailContext.threadId,
  };

  sendToBackground(payload).then((response) => {
    if (response?.reply) {
      addMessage('agent', response.reply);
    }
    if (response?.error) {
      showToast(response.error, 'error');
    } else {
      showToast(`${actionType.replace('_', ' ')} initiated`, 'success');
    }
  });
}

// ─── Pending Approvals ──────────────────────────────────────────
async function fetchPendingApprovals(): Promise<void> {
  try {
    const response = await sendToBackground({ type: MESSAGE_TYPES.GET_PENDING_APPROVALS });
    const approvals = response?.approvals ?? [];
    renderApprovals(approvals);
  } catch {
    // Silent fail — approvals section just won't show
  }
}

interface ApprovalItem {
  id: string;
  actionType: string;
  description: string;
  risk: string;
}

function renderApprovals(approvals: ApprovalItem[]): void {
  if (!approvals.length) {
    if (dom.approvalsSection) dom.approvalsSection.hidden = true;
    return;
  }

  if (dom.approvalsSection) dom.approvalsSection.hidden = false;
  if (dom.approvalCount) dom.approvalCount.textContent = String(approvals.length);

  if (dom.approvalsList) {
    dom.approvalsList.innerHTML = approvals.map((a) => {
      const riskBadge = `<span class="badge badge--risk" data-risk="${a.risk ?? 'MEDIUM'}">${a.risk ?? 'MEDIUM'}</span>`;
      const icon = getActionIcon(a.actionType);
      return `
        <div class="approval-card" data-id="${a.id}">
          <div class="approval-card__header">
            <div class="approval-card__icon">${icon}</div>
            <div class="approval-card__info">
              <div class="approval-card__type">${escapeHtml(a.actionType ?? 'Action')}</div>
              <div class="approval-card__desc">${escapeHtml(a.description ?? '')}</div>
            </div>
            ${riskBadge}
          </div>
          <div class="approval-card__actions">
            <button class="btn btn--success btn--sm" data-approve="${a.id}">✓ Approve</button>
            <button class="btn btn--secondary btn--sm" data-edit="${a.id}">✎ Edit</button>
            <button class="btn btn--danger btn--sm" data-reject="${a.id}">✕ Reject</button>
          </div>
        </div>
      `;
    }).join('');

    // Bind approval actions
    dom.approvalsList.querySelectorAll('[data-approve]').forEach((btn) => {
      const b = btn as HTMLElement;
      b.addEventListener('click', () => {
        if (b.dataset.approve) handleApproval(b.dataset.approve, 'approve');
      });
    });
    dom.approvalsList.querySelectorAll('[data-reject]').forEach((btn) => {
      const b = btn as HTMLElement;
      b.addEventListener('click', () => {
        if (b.dataset.reject) handleApproval(b.dataset.reject, 'reject');
      });
    });
    dom.approvalsList.querySelectorAll('[data-edit]').forEach((btn) => {
      const b = btn as HTMLElement;
      b.addEventListener('click', () => {
        if (b.dataset.edit) handleApproval(b.dataset.edit, 'edit');
      });
    });
  }
}

async function handleApproval(id: string, action: 'approve' | 'reject' | 'edit'): Promise<void> {
  const typeMap: Record<string, string> = {
    approve: MESSAGE_TYPES.APPROVE_ACTION,
    reject: MESSAGE_TYPES.REJECT_ACTION,
    edit: MESSAGE_TYPES.EDIT_ACTION,
  };

  const type = typeMap[action];
  if (!type) return;

  try {
    const response = await sendToBackground({ type, actionId: id });
    showToast(response?.message ?? `Action ${action}d`, action === 'approve' ? 'success' : 'info');
    fetchPendingApprovals();
    fetchActionHistory();
  } catch {
    showToast(`Failed to ${action} action`, 'error');
  }
}

// ─── Action History ──────────────────────────────────────────────
async function fetchActionHistory(): Promise<void> {
  try {
    const response = await sendToBackground({ type: MESSAGE_TYPES.GET_ACTION_HISTORY });
    const history = response?.history ?? [];
    renderHistory(history);
  } catch {
    // Silent fail
  }
}

function renderHistory(history: QueuedAction[]): void {
  if (!dom.historyList) return;
  if (!history.length) {
    dom.historyList.innerHTML = `
      <div class="empty-state">
        <span class="empty-state__icon">📋</span>
        <span class="empty-state__text">No actions yet</span>
      </div>
    `;
    return;
  }

  dom.historyList.innerHTML = history.slice(0, 20).map((item) => {
    const statusIcon = {
      [ACTION_STATUS.COMPLETED]: '✅',
      [ACTION_STATUS.FAILED]: '❌',
      [ACTION_STATUS.PENDING]: '⏳',
      [ACTION_STATUS.APPROVED]: '✅',
      [ACTION_STATUS.REJECTED]: '🚫',
    }[item.status] ?? '⏳';

    return `
      <div class="history-item">
        <span class="history-item__icon">${statusIcon}</span>
        <span class="history-item__text">${escapeHtml(item.reason || item.type || 'Action')}</span>
        <span class="history-item__time">${formatTime(new Date(item.timestamp))}</span>
      </div>
    `;
  }).join('');
}

// ─── Collapsible Sections ────────────────────────────────────────
function setupCollapsibleSections(): void {
  document.querySelectorAll('[data-collapse]').forEach((header) => {
    header.addEventListener('click', () => {
      const h = header as HTMLElement;
      const targetId = h.dataset.collapse;
      if (!targetId) return;
      const body = document.getElementById(targetId);
      if (!body) return;

      body.classList.toggle('section-body--collapsed');
      h.classList.toggle('collapsed');
    });
  });
}

// ─── Event Listeners ─────────────────────────────────────────────
function setupEventListeners(): void {
  // Auth
  dom.authBtn?.addEventListener('click', handleLogin);

  // Settings
  dom.settingsBtn?.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Clear chat
  dom.clearChatBtn?.addEventListener('click', () => {
    conversationHistory = [];
    if (dom.chatMessages) {
      dom.chatMessages.innerHTML = `
        <div class="message message--agent fade-in">
          <div class="message__avatar">✦</div>
          <div class="message__content">
            <div class="message__role">MailFlow</div>
            <div class="message__text">👋 Hello! I can summarize emails, draft replies, search your inbox, and more. What would you like to do?</div>
            <div class="message__time">Just now</div>
          </div>
        </div>
      `;
    }
    saveConversationHistory();
    showToast('Chat cleared', 'info');
  });

  // Chat input
  dom.chatInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  });
  dom.chatInput?.addEventListener('input', autoResizeTextarea);
  dom.sendBtn?.addEventListener('click', handleSendMessage);

  // Quick actions
  dom.quickActions?.addEventListener('click', (e) => {
    const chip = (e.target as Element).closest('.chip') as HTMLElement | null;
    if (chip?.dataset.action) {
      handleQuickAction(chip.dataset.action);
    }
  });

  // Email context actions
  document.querySelectorAll('[data-ctx-action]').forEach((btn) => {
    const b = btn as HTMLElement;
    b.addEventListener('click', () => {
      if (b.dataset.ctxAction) {
        handleContextAction(b.dataset.ctxAction);
      }
    });
  });

  // Listen for messages from content script / service worker
  chrome.runtime.onMessage.addListener((message: any, _sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
    switch (message.type) {
      case MESSAGE_TYPES.EMAIL_CONTEXT_UPDATE:
        updateEmailContext(message.context);
        break;
      case MESSAGE_TYPES.EMAIL_CONTEXT_CLEAR:
        updateEmailContext(null);
        break;
      case MESSAGE_TYPES.AUTH_STATUS_RESPONSE:
        updateAuthUI(message.authenticated, message.email);
        break;
      case 'TRIGGER_QUICK_ACTION':
        if (message.action) {
          handleQuickAction(message.action);
        }
        break;
      default:
        break;
    }
    sendResponse({ received: true });
  });
}

// ─── Textarea Auto-Resize ────────────────────────────────────────
function autoResizeTextarea(): void {
  if (!dom.chatInput) return;
  dom.chatInput.style.height = 'auto';
  dom.chatInput.style.height = Math.min(dom.chatInput.scrollHeight, 100) + 'px';
}

// ─── Toast Notifications ─────────────────────────────────────────
function showToast(message: string, type: 'success' | 'error' | 'warning' | 'info' | string = 'info'): void {
  const icons: Record<string, string> = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ',
  };

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.innerHTML = `<span>${icons[type] ?? ''}</span> ${escapeHtml(message)}`;
  if (dom.toastContainer) {
    dom.toastContainer.appendChild(toast);
  }

  setTimeout(() => {
    toast.classList.add('removing');
    toast.addEventListener('animationend', () => toast.remove());
  }, 3000);
}

// ─── Persistence ─────────────────────────────────────────────────
async function saveConversationHistory(): Promise<void> {
  try {
    await chrome.storage.session.set({ conversationHistory });
  } catch {
    // Session storage may not be available
  }
}

async function loadConversationHistory(): Promise<void> {
  try {
    const data = (await chrome.storage.session.get('conversationHistory')) as { conversationHistory?: ConversationTurn[] };
    if (data.conversationHistory?.length) {
      conversationHistory = data.conversationHistory;
      // Re-render messages (skip the welcome message already in DOM)
      conversationHistory.forEach(({ role, text, timestamp }) => {
        const messageEl = document.createElement('div');
        messageEl.className = `message message--${role}`;
        messageEl.innerHTML = `
          <div class="message__avatar">
            ${role === 'user'
              ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'
              : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>'
            }
          </div>
          <div class="message__content">
            <div class="message__role">${role === 'user' ? 'You' : 'MailFlow-agent'}</div>
            <div class="message__text">${escapeHtml(text)}</div>
            <div class="message__time">${timestamp}</div>
          </div>
        `;
        if (dom.chatMessages) dom.chatMessages.appendChild(messageEl);
      });
      if (dom.chatMessages) dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
    }
  } catch {
    // Ignore
  }
}

// ─── Helpers ─────────────────────────────────────────────────────
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

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatTime(date: Date): string {
  if (!(date instanceof Date) || isNaN(date.getTime())) return 'Just now';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getActionIcon(type: string): string {
  const icons: Record<string, string> = {
    ARCHIVE_EMAIL: '📦',
    TRASH_EMAIL: '🗑️',
    LABEL_EMAIL: '🏷️',
    DRAFT_REPLY: '✏️',
    SEND_EMAIL: '📤',
    SUMMARIZE_EMAIL: '📝',
  };
  return icons[type] ?? '⚡';
}
