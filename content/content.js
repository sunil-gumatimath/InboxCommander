/**
 * content/content.js
 * Content script injected into mail.google.com
 * Detects Gmail navigation context and bridges DOM info to the service worker.
 */

const GMAIL_THREAD_REGEX = /[#/](?:inbox|sent|drafts|starred|all|trash|spam|label\/[^/]+)\/([A-Za-z0-9]+)/;
const GMAIL_COMPOSE_SELECTOR = 'div.nH div.no div.nH div.aeJ';
const GMAIL_MESSAGE_LIST_SELECTOR = 'div[role="main"] table.F.cf.zt';
const GMAIL_THREAD_VIEW_SELECTOR = 'div[role="main"] div.nH.if';

let currentView = null; // 'inbox' | 'thread' | 'compose' | null
let currentThreadId = null;

// ─── URL Parsing ─────────────────────────────────────────────────
function parseGmailContext() {
  const hash = window.location.hash;
  const threadMatch = hash.match(GMAIL_THREAD_REGEX);

  if (threadMatch) {
    return { view: 'thread', threadId: threadMatch[1] };
  }

  if (hash.includes('compose')) {
    return { view: 'compose', threadId: null };
  }

  // Default: inbox / label view
  return { view: 'inbox', threadId: null };
}

// ─── Context Change Detection ────────────────────────────────────
function onContextChange() {
  const ctx = parseGmailContext();

  if (ctx.view === currentView && ctx.threadId === currentThreadId) {
    return; // No change
  }

  currentView = ctx.view;
  currentThreadId = ctx.threadId;

  if (ctx.view === 'thread' && ctx.threadId) {
    // Notify service worker about thread being viewed
    chrome.runtime.sendMessage({
      type: 'GMAIL_CONTEXT_CHANGE',
      context: {
        view: 'thread',
        threadId: ctx.threadId,
        url: window.location.href,
      },
    }).catch(() => { /* Extension context may be invalidated */ });

    // Try to extract email metadata from the DOM
    extractThreadMetadata(ctx.threadId);
  } else if (ctx.view === 'compose') {
    chrome.runtime.sendMessage({
      type: 'GMAIL_CONTEXT_CHANGE',
      context: { view: 'compose', url: window.location.href },
    }).catch(() => {});
  } else {
    chrome.runtime.sendMessage({
      type: 'GMAIL_CONTEXT_CHANGE',
      context: { view: 'inbox', url: window.location.href },
    }).catch(() => {});
  }
}

// ─── Extract thread metadata from Gmail DOM ──────────────────────
function extractThreadMetadata(threadId) {
  // Wait for the thread view to render
  setTimeout(() => {
    try {
      // Subject — try the thread subject header
      const subjectEl =
        document.querySelector('h2.hP') ||
        document.querySelector('div[role="main"] h2');
      const subject = subjectEl?.textContent?.trim() ?? '';

      // Sender — try the first message sender
      const senderEl =
        document.querySelector('span.gD') ||
        document.querySelector('span[email]');
      const from = senderEl?.getAttribute('email') ?? senderEl?.textContent?.trim() ?? '';
      const fromName = senderEl?.getAttribute('name') ?? from;

      if (subject || from) {
        chrome.runtime.sendMessage({
          type: 'EMAIL_CONTEXT_UPDATE',
          context: {
            threadId,
            subject,
            from: fromName ? `${fromName} <${from}>` : from,
            emailId: null, // Will be populated by service worker
          },
        }).catch(() => {});
      }
    } catch {
      // DOM parsing can fail silently
    }
  }, 500);
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
function startObserving() {
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
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.type) {
    case 'GET_CURRENT_CONTEXT':
      sendResponse({
        view: currentView,
        threadId: currentThreadId,
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
function showNotification(text, level = 'info') {
  const existing = document.getElementById('gmail-ai-notification');
  if (existing) existing.remove();

  const el = document.createElement('div');
  el.id = 'gmail-ai-notification';
  el.className = `gmail-ai-notif gmail-ai-notif--${level}`;
  el.textContent = text;
  document.body.appendChild(el);

  setTimeout(() => {
    el.classList.add('gmail-ai-notif--hide');
    el.addEventListener('animationend', () => el.remove());
  }, 3000);
}

console.log('[MailFlow-agent] Content script loaded on Gmail.');
