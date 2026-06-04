/**
 * content/content.ts
 * Content script injected into mail.google.com
 * Detects Gmail navigation context and bridges DOM info to the service worker.
 */

const GMAIL_THREAD_REGEX = /\/([A-Za-z0-9]{15,})$/;

let currentView: 'inbox' | 'thread' | 'compose' | null = null;
let currentUrlThreadId: string | null = null;
let currentThreadId: string | null = null;
let currentEmailId: string | null = null;
let activeIntervalId: any = null;

interface GmailContext {
  view: 'inbox' | 'thread' | 'compose';
  threadId: string | null;
}

function isValidHexId(id: string): boolean {
  return /^[0-9a-fA-F]{15,18}$/.test(id);
}

function safeSendMessage(message: any): void {
  try {
    if (chrome.runtime?.id) {
      chrome.runtime.sendMessage(message).catch(() => {
        // Fail silently when context is invalidated
      });
    }
  } catch (err) {
    // Fail silently when context is invalidated
  }
}

// ─── URL Parsing ─────────────────────────────────────────────────
function parseGmailContext(): GmailContext {
  const hash = window.location.hash;
  const threadMatch = hash.match(GMAIL_THREAD_REGEX);

  if (threadMatch && threadMatch[1]) {
    return { view: 'thread', threadId: threadMatch[1] };
  }

  if (hash.includes('compose')) {
    return { view: 'compose', threadId: null };
  }

  // Default: inbox / label view
  return { view: 'inbox', threadId: null };
}

// ─── Context Change Detection ────────────────────────────────────
function onContextChange(): void {
  const ctx = parseGmailContext();

  // If in thread view, check if the active message ID has changed in the DOM.
  // We use the last message element in the DOM (the newest message in the view).
  let isSameActiveMessage = true;
  if (ctx.view === 'thread') {
    const messageEls = document.querySelectorAll('[data-legacy-message-id]');
    const lastEl = messageEls.length > 0 ? messageEls[messageEls.length - 1] : null;
    const domMessageId = lastEl ? lastEl.getAttribute('data-legacy-message-id') : null;
    const resolvedEmailId = (domMessageId && isValidHexId(domMessageId)) ? domMessageId : null;
    if (resolvedEmailId && resolvedEmailId !== currentEmailId) {
      isSameActiveMessage = false;
    }
  }

  // We only skip if the view, thread URL ID, and email ID matches.
  // If we don't have a resolved emailId yet, we should keep check/extraction open.
  if (ctx.view === currentView && ctx.threadId === currentUrlThreadId && (ctx.view !== 'thread' || (currentEmailId !== null && isSameActiveMessage))) {
    return; // No change
  }

  currentView = ctx.view;
  const prevUrlThreadId = currentUrlThreadId;
  currentUrlThreadId = ctx.threadId;

  // If we switch views or switch threads, clear the resolved hex IDs
  if (ctx.view !== 'thread' || ctx.threadId !== prevUrlThreadId) {
    currentThreadId = null;
    currentEmailId = null;
  }

  if (ctx.view === 'thread' && ctx.threadId) {
    // Try to extract email metadata from the DOM and resolve the legacy hex IDs
    extractThreadMetadata(ctx.threadId);
  } else if (ctx.view === 'compose') {
    safeSendMessage({
      type: 'GMAIL_CONTEXT_CHANGE',
      context: { view: 'compose', url: window.location.href },
    });
  } else {
    safeSendMessage({
      type: 'GMAIL_CONTEXT_CHANGE',
      context: { view: 'inbox', url: window.location.href },
    });
  }
}

// ─── Extract thread metadata from Gmail DOM ──────────────────────
function extractThreadMetadata(threadId: string): void {
  if (activeIntervalId) {
    clearInterval(activeIntervalId);
    activeIntervalId = null;
  }

  let attempts = 0;
  const maxAttempts = 20; // 2 seconds max

  activeIntervalId = setInterval(() => {
    attempts++;
    try {
      const subjectEl =
        document.querySelector('h2.hP') ||
        document.querySelector('div[role="main"] h2');

      const domThreadId = subjectEl?.getAttribute('data-legacy-thread-id');
      const resolvedThreadId = (domThreadId && isValidHexId(domThreadId)) ? domThreadId : threadId;

      const messageEls = document.querySelectorAll('[data-legacy-message-id]');
      const lastEl = messageEls.length > 0 ? messageEls[messageEls.length - 1] : null;
      const domMessageId = lastEl ? lastEl.getAttribute('data-legacy-message-id') : null;
      const resolvedEmailId = (domMessageId && isValidHexId(domMessageId)) ? domMessageId : null;

      // If we resolved a valid hex ID from the DOM, or if we ran out of attempts, finish up
      if (isValidHexId(resolvedThreadId) || resolvedEmailId || attempts >= maxAttempts) {
        clearInterval(activeIntervalId);
        activeIntervalId = null;
        if (isValidHexId(resolvedThreadId)) {
          currentThreadId = resolvedThreadId;
        }
        if (resolvedEmailId) {
          currentEmailId = resolvedEmailId;
        }

        const subject = subjectEl?.textContent?.trim() ?? '';

        const senderEl =
          document.querySelector('span.gD') ||
          document.querySelector('span[email]');
        const from = senderEl?.getAttribute('email') ?? senderEl?.textContent?.trim() ?? '';
        const fromName = senderEl?.getAttribute('name') ?? from;

        // Send GMAIL_CONTEXT_CHANGE to background with resolved IDs
        safeSendMessage({
          type: 'GMAIL_CONTEXT_CHANGE',
          context: {
            view: 'thread',
            threadId: resolvedThreadId,
            emailId: resolvedEmailId,
            url: window.location.href,
          },
        });

        if (subject || from) {
          safeSendMessage({
            type: 'EMAIL_CONTEXT_UPDATE',
            context: {
              threadId: resolvedThreadId,
              subject,
              from: fromName ? `${fromName} <${from}>` : from,
              emailId: resolvedEmailId,
            },
          });
        }
      }
    } catch {
      // DOM parsing can fail silently
    }
  }, 100);
}

// ─── Listen for hash changes (Gmail SPA navigation) ──────────────
window.addEventListener('hashchange', onContextChange);

// ─── MutationObserver for DOM changes ────────────────────────────
const observer = new MutationObserver((mutations) => {
  // Re-check context when Gmail's main area changes
  for (const mutation of mutations) {
    if (mutation.addedNodes.length > 0) {
      onContextChange();
      break;
    }
  }
});

// Start observing once Gmail's main container is ready
function startObserving(): boolean {
  const mainEl = document.querySelector('div[role="main"]');
  if (mainEl) {
    observer.observe(mainEl, { childList: true, subtree: true });
    onContextChange(); // Check initial state
    return true;
  }
  return false;
}

// Gmail may not have rendered the main container yet — retry
if (!startObserving()) {
  const initObserver = new MutationObserver(() => {
    if (startObserving()) {
      initObserver.disconnect();
    }
  });
  initObserver.observe(document.body, { childList: true, subtree: true });
}

// ─── Listen for messages from service worker ─────────────────────
chrome.runtime.onMessage.addListener((message: any, _sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
  switch (message.type) {
    case 'GET_CURRENT_CONTEXT':
      sendResponse({
        view: currentView,
        threadId: currentThreadId,
        emailId: currentEmailId,
        url: window.location.href,
      });
      break;
    case 'SHOW_NOTIFICATION':
      showNotification(message.text, message.level);
      break;
    default:
      break;
  }
  return true;
});

// ─── In-page notification (subtle) ───────────────────────────────
async function showNotification(text: string, level: string = 'info'): Promise<void> {
  const existing = document.getElementById('gmail-ai-notification');
  if (existing) existing.remove();

  let theme = 'light';
  try {
    if (chrome.storage?.local) {
      const res = (await chrome.storage.local.get('extension_settings')) as {
        extension_settings?: { theme?: 'light' | 'dark' };
      };
      if (res?.extension_settings?.theme === 'dark') {
        theme = 'dark';
      }
    }
  } catch (e) {
    // Default to light theme on error
  }

  const el = document.createElement('div');
  el.id = 'gmail-ai-notification';
  el.className = `gmail-ai-notif gmail-ai-notif--${level}`;
  el.setAttribute('data-theme', theme);
  el.textContent = text;
  document.body.appendChild(el);

  setTimeout(() => {
    el.classList.add('gmail-ai-notif--hide');
    el.addEventListener('animationend', () => el.remove());
  }, 3000);
}

console.log('[InboxCommander] Content script loaded on Gmail.');
