/**
 * options/options.ts
 * Settings page logic
 */

import { DEFAULT_SETTINGS, MESSAGE_TYPES, GEMINI_MODELS, DEFAULT_GEMINI_MODEL } from '../shared/constants';
import type { Settings } from '../shared/types';
import { applyStoredTheme } from '../shared/utils';

const $ = <T extends Element = HTMLElement>(sel: string): T | null => document.querySelector<T>(sel);

const dom = {
  get apiKeyInput() { return $('#apiKey') as HTMLInputElement | null; },
  get toggleApiKeyBtn() { return $('#toggleApiKey') as HTMLButtonElement | null; },
  get testApiBtn() { return $('#testApiBtn') as HTMLButtonElement | null; },
  get testApiStatus() { return $('#apiStatus'); },
  get geminiModel() { return $('#geminiModel') as HTMLSelectElement | null; },
  
  get approveLow() { return $('#approvalLow') as HTMLInputElement | null; },
  get approveMedium() { return $('#approvalMedium') as HTMLInputElement | null; },
  get approveHigh() { return $('#approvalHigh') as HTMLInputElement | null; },
  
  get toneSelect() { return $('#writingTone') as HTMLSelectElement | null; },
  get signatureText() { return $('#emailSignature') as HTMLTextAreaElement | null; },
  get userName() { return $('#userName') as HTMLInputElement | null; },
  
  get maxEmails() { return $('#maxEmails') as HTMLInputElement | null; },
  
  get connectedEmail() { return $('#accountEmail'); },
  get accountIndicator() { return $('#accountIndicator'); },
  get accountStatusText() { return $('#accountStatusText'); },
  get disconnectBtn() { return $('#disconnectBtn') as HTMLButtonElement | null; },
  
  get saveBar() { return $('#saveBar') as HTMLElement | null; },
  get saveBtn() { return $('#saveBtn') as HTMLButtonElement | null; },
  get themeDark() { return $('#themeDark'); },
  get themeLight() { return $('#themeLight'); },
  
  get clearLogBtn() { return $('#clearLogBtn') as HTMLButtonElement | null; },
  get actionLog() { return $('#actionLog'); },
  get toastContainer() { return $('#toastContainer'); },
};

let currentSettings: Settings = { ...DEFAULT_SETTINGS };

async function initOptions(): Promise<void> {
  await applyStoredTheme();
  populateModelOptions();
  await loadSettings();
  await checkAuthStatus();
  await loadActionLog();
  setupEventListeners();
  setupSidebarNav();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initOptions);
} else {
  initOptions();
}

function populateModelOptions(): void {
  if (!dom.geminiModel) return;
  dom.geminiModel.innerHTML = GEMINI_MODELS
    .map((m) => `<option value="${m.id}">${m.label}</option>`)
    .join('');
}

async function loadSettings(): Promise<void> {
  const { extension_settings } = (await chrome.storage.local.get('extension_settings')) as { extension_settings?: Partial<Settings> };
  if (extension_settings) {
    currentSettings = { ...DEFAULT_SETTINGS, ...extension_settings };
  }
  
  // Populate UI
  const { geminiApiKey } = (await chrome.storage.local.get('geminiApiKey')) as { geminiApiKey?: string };
  if (geminiApiKey && dom.apiKeyInput) dom.apiKeyInput.value = geminiApiKey;
  
  if (dom.approveLow) dom.approveLow.checked = currentSettings.approvalRequired.low;
  if (dom.approveMedium) dom.approveMedium.checked = currentSettings.approvalRequired.medium;
  if (dom.approveHigh) dom.approveHigh.checked = currentSettings.approvalRequired.high;
  
  if (dom.geminiModel) dom.geminiModel.value = currentSettings.geminiModel || DEFAULT_GEMINI_MODEL;

  if (dom.toneSelect) dom.toneSelect.value = currentSettings.writingTone || 'professional';
  if (dom.signatureText) dom.signatureText.value = currentSettings.emailSignature || '';
  if (dom.userName) dom.userName.value = currentSettings.userName || '';
  if (dom.maxEmails) dom.maxEmails.value = String(currentSettings.maxEmails || 50);

  updateThemeUI(currentSettings.theme || 'light');
}

async function checkAuthStatus(): Promise<void> {
  try {
    const response = await sendToBackground({ type: MESSAGE_TYPES.AUTH_STATUS });
    if (response?.authenticated) {
      if (dom.connectedEmail) dom.connectedEmail.textContent = response.email || 'Connected';
      if (dom.accountIndicator) dom.accountIndicator.classList.add('connected');
      if (dom.accountStatusText) dom.accountStatusText.textContent = 'Connected';
      if (dom.disconnectBtn) dom.disconnectBtn.hidden = false;
    } else {
      setDisconnected();
    }
  } catch {
    setDisconnected();
  }
}

function setDisconnected(): void {
  if (dom.connectedEmail) dom.connectedEmail.textContent = 'Not connected';
  if (dom.accountIndicator) dom.accountIndicator.classList.remove('connected');
  if (dom.accountStatusText) dom.accountStatusText.textContent = 'Disconnected';
  if (dom.disconnectBtn) dom.disconnectBtn.hidden = true;
}

async function loadActionLog(): Promise<void> {
  const { actionQueue_log } = (await chrome.storage.local.get('actionQueue_log')) as { actionQueue_log?: LogItem[] };
  renderActionLog(actionQueue_log ?? []);
}

interface LogItem {
  status: 'executed' | 'failed' | 'pending' | 'approved' | 'rejected' | string;
  timestamp: number;
  reason?: string;
  type: string;
}

function renderActionLog(log: LogItem[]): void {
  if (!dom.actionLog) return;
  if (!log || !log.length) {
    dom.actionLog.innerHTML = `
      <div class="empty-state">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        <span>No actions recorded yet</span>
      </div>
    `;
    return;
  }
  
  dom.actionLog.innerHTML = log.slice(0, 50).map(item => {
    const statusIcon = {
      executed: '✓',
      failed: '✗',
      pending: '…',
      approved: '✓',
      rejected: '✗',
    }[item.status] ?? '…';
    
    const statusClass = {
      executed: 'success',
      approved: 'success',
      failed: 'error',
      rejected: 'error',
      pending: 'pending',
    }[item.status] ?? 'pending';

    const time = new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    return `
      <div class="log-item">
        <span class="log-item__icon status-${statusClass}">${statusIcon}</span>
        <span class="log-item__text">${escapeHtml(item.reason || item.type)}</span>
        <span class="log-item__time">${time}</span>
      </div>
    `;
  }).join('');
}

function updateThemeUI(theme: string): void {
  const isLight = theme === 'light';
  document.documentElement.dataset.theme = isLight ? 'light' : 'dark';
  dom.themeLight?.classList.toggle('active', isLight);
  dom.themeDark?.classList.toggle('active', !isLight);
  dom.themeLight?.setAttribute('aria-pressed', String(isLight));
  dom.themeDark?.setAttribute('aria-pressed', String(!isLight));
}

function setupSidebarNav(): void {
  const links = document.querySelectorAll<HTMLAnchorElement>('.nav-link[data-section]');
  
  links.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const sectionId = link.dataset.section;
      if (!sectionId) return;

      const section = document.getElementById(sectionId);
      if (section) {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }

      links.forEach(l => l.classList.remove('active'));
      link.classList.add('active');
    });
  });

  // Track scroll position to highlight current nav link
  const sections = Array.from(document.querySelectorAll<HTMLElement>('.card[id]'));
  const content = document.querySelector('.content');
  if (!content) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const id = entry.target.id;
          links.forEach(l => {
            l.classList.toggle('active', l.dataset.section === id);
          });
        }
      });
    },
    { rootMargin: '-20% 0px -60% 0px' }
  );

  sections.forEach(section => observer.observe(section));
}

function setupEventListeners(): void {
  // Input changes
  const inputs = [
    dom.apiKeyInput, dom.geminiModel, dom.approveLow, dom.approveMedium, dom.approveHigh,
    dom.toneSelect, dom.signatureText, dom.userName, dom.maxEmails
  ];
  
  inputs.forEach(input => {
    if (input) {
      input.addEventListener('input', showSaveBar);
      input.addEventListener('change', showSaveBar);
    }
  });

  dom.themeDark?.addEventListener('click', () => {
    if (currentSettings.theme !== 'dark') {
      currentSettings.theme = 'dark';
      updateThemeUI('dark');
      showSaveBar();
    }
  });

  dom.themeLight?.addEventListener('click', () => {
    if (currentSettings.theme !== 'light') {
      currentSettings.theme = 'light';
      updateThemeUI('light');
      showSaveBar();
    }
  });
  
  dom.toggleApiKeyBtn?.addEventListener('click', () => {
    if (!dom.apiKeyInput || !dom.toggleApiKeyBtn) return;
    const type = dom.apiKeyInput.type === 'password' ? 'text' : 'password';
    dom.apiKeyInput.type = type;
    // Swap the eye icon
    const svg = type === 'password'
      ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
      : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
    dom.toggleApiKeyBtn.innerHTML = svg;
  });
  
  dom.testApiBtn?.addEventListener('click', async () => {
    if (!dom.apiKeyInput || !dom.testApiBtn || !dom.testApiStatus) return;
    const apiKey = dom.apiKeyInput.value.trim();
    if (!apiKey) {
      dom.testApiStatus.textContent = 'API Key is required';
      dom.testApiStatus.className = 'status-text error';
      return;
    }
    
    dom.testApiBtn.disabled = true;
    dom.testApiStatus.textContent = 'Testing…';
    dom.testApiStatus.className = 'status-text loading';
    
    try {
      // Temporarily set it
      await chrome.storage.local.set({ geminiApiKey: apiKey });
      const model = dom.geminiModel?.value || DEFAULT_GEMINI_MODEL;
      let res: Response | undefined;
      const retries = 3;
      let delayMs = 1000;
      for (let i = 0; i < retries; i++) {
        try {
          res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              system_instruction: {
                parts: [{ text: 'You are a helpful email assistant.' }]
              },
              contents: [{ parts: [{ text: "Hello" }] }],
              generationConfig: { temperature: 0.7, maxOutputTokens: 64 }
            })
          });
          
          // Retry on transient errors (503 Service Unavailable / 429 Rate Limit)
          if ((res.status === 503 || res.status === 429) && i < retries - 1) {
            console.warn(`[InboxCommander] Gemini API returned ${res.status}. Retrying in ${delayMs}ms... (Attempt ${i + 1}/${retries})`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
            delayMs *= 2;
            continue;
          }
          break;
        } catch (err) {
          if (i === retries - 1) throw err;
          console.warn(`[InboxCommander] Fetch failed. Retrying in ${delayMs}ms... (Attempt ${i + 1}/${retries})`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
          delayMs *= 2;
        }
      }
      
      if (res && res.ok) {
        dom.testApiStatus.textContent = 'Connection successful';
        dom.testApiStatus.className = 'status-text success';
        showToast('API key verified successfully', 'success');
        showSaveBar();
      } else {
        let reason = res ? `HTTP ${res.status}` : 'Unknown error';
        if (res) {
          try {
            const text = await res.text();
            console.warn('[Gemini Test API error response]', text);
            const body = JSON.parse(text);
            reason = body?.error?.message || body?.message || reason;
          } catch {
            // keep HTTP status as fallback
          }
        }
        dom.testApiStatus.textContent = reason;
        dom.testApiStatus.className = 'status-text error';
      }
    } catch (e) {
      dom.testApiStatus.textContent = 'Network error';
      dom.testApiStatus.className = 'status-text error';
    } finally {
      dom.testApiBtn.disabled = false;
    }
  });
  
  dom.disconnectBtn?.addEventListener('click', async () => {
    if (confirm('Are you sure you want to disconnect your Gmail account?')) {
      await sendToBackground({ type: MESSAGE_TYPES.AUTH_LOGOUT });
      await checkAuthStatus();
      showToast('Account disconnected', 'success');
    }
  });

  dom.clearLogBtn?.addEventListener('click', async () => {
    if (confirm('Are you sure you want to clear the action log?')) {
      await chrome.storage.local.set({ actionQueue_log: [] });
      renderActionLog([]);
      showToast('Action log cleared', 'success');
    }
  });
  
  dom.saveBtn?.addEventListener('click', async () => {
    if (!dom.saveBtn) return;
    dom.saveBtn.textContent = 'Saving…';
    dom.saveBtn.disabled = true;
    
    const newSettings: Settings = {
      ...currentSettings,
      geminiModel: dom.geminiModel?.value || DEFAULT_GEMINI_MODEL,
      approvalRequired: {
        low: dom.approveLow?.checked ?? false,
        medium: dom.approveMedium?.checked ?? true,
        high: dom.approveHigh?.checked ?? true,
      },
      writingTone: dom.toneSelect?.value ?? 'professional',
      emailSignature: dom.signatureText?.value ?? '',
      userName: dom.userName?.value ?? '',
      maxEmails: parseInt(dom.maxEmails?.value || '50', 10) || 50,
    };
    
    await chrome.storage.local.set({ 
      extension_settings: newSettings,
      geminiApiKey: dom.apiKeyInput?.value.trim() ?? ''
    });
    currentSettings = newSettings;
    
    showToast('Settings saved', 'success');
    hideSaveBar();
    dom.saveBtn.disabled = false;
    dom.saveBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      Save Changes
    `;
  });
}

function showSaveBar(): void {
  if (dom.saveBar) {
    dom.saveBar.hidden = false;
  }
}

function hideSaveBar(): void {
  if (dom.saveBar) {
    dom.saveBar.hidden = true;
  }
}

function showToast(message: string, type: 'success' | 'error' = 'success'): void {
  const container = dom.toastContainer;
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icon = type === 'success'
    ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
    : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';

  toast.innerHTML = `${icon}<span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('removing');
    toast.addEventListener('animationend', () => toast.remove());
  }, 2800);
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

function escapeHtml(str: string): string {
  if (typeof str !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
