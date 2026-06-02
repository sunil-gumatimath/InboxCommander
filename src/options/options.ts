/**
 * options/options.ts
 * Settings page logic
 */

import { DEFAULT_SETTINGS, MESSAGE_TYPES } from '../shared/constants';
import type { Settings } from '../shared/types';
import { applyStoredTheme } from '../shared/utils';

const $ = <T extends Element = HTMLElement>(sel: string): T | null => document.querySelector<T>(sel);

const dom = {
  get apiKeyInput() { return $('#apiKey') as HTMLInputElement | null; },
  get toggleApiKeyBtn() { return $('#toggleApiKey') as HTMLButtonElement | null; },
  get testApiBtn() { return $('#testApiBtn') as HTMLButtonElement | null; },
  get testApiStatus() { return $('#apiStatus'); },
  
  get approveLow() { return $('#approvalLow') as HTMLInputElement | null; },
  get approveMedium() { return $('#approvalMedium') as HTMLInputElement | null; },
  get approveHigh() { return $('#approvalHigh') as HTMLInputElement | null; },
  
  get toneSelect() { return $('#writingTone') as HTMLSelectElement | null; },
  get signatureText() { return $('#emailSignature') as HTMLTextAreaElement | null; },
  get userName() { return $('#userName') as HTMLInputElement | null; },
  
  get maxEmails() { return $('#maxEmails') as HTMLInputElement | null; },
  
  get connectedEmail() { return $('#accountEmail'); },
  get disconnectBtn() { return $('#disconnectBtn') as HTMLButtonElement | null; },
  
  get saveFloatBtn() { return $('#saveBtn') as HTMLButtonElement | null; },
  get themeDark() { return $('#themeDark'); },
  get themeLight() { return $('#themeLight'); },
  
  get clearLogBtn() { return $('#clearLogBtn') as HTMLButtonElement | null; },
  get actionLog() { return $('#actionLog'); },
};

let currentSettings: Settings = { ...DEFAULT_SETTINGS };

async function initOptions(): Promise<void> {
  await applyStoredTheme();
  await loadSettings();
  await checkAuthStatus();
  await loadActionLog();
  setupEventListeners();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initOptions);
} else {
  initOptions();
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
  
  if (dom.toneSelect) dom.toneSelect.value = currentSettings.writingTone || 'professional';
  if (dom.signatureText) dom.signatureText.value = currentSettings.emailSignature || '';
  if (dom.userName) dom.userName.value = currentSettings.userName || '';
  if (dom.maxEmails) dom.maxEmails.value = String(currentSettings.maxEmails || 50);

  updateThemeUI(currentSettings.theme || 'dark');
}

async function checkAuthStatus(): Promise<void> {
  try {
    const response = await sendToBackground({ type: MESSAGE_TYPES.AUTH_STATUS });
    if (response?.authenticated) {
      if (dom.connectedEmail) dom.connectedEmail.textContent = response.email || 'Connected';
      if (dom.disconnectBtn) dom.disconnectBtn.hidden = false;
    } else {
      if (dom.connectedEmail) dom.connectedEmail.textContent = 'Not connected';
      if (dom.disconnectBtn) dom.disconnectBtn.hidden = true;
    }
  } catch {
    if (dom.connectedEmail) dom.connectedEmail.textContent = 'Not connected';
    if (dom.disconnectBtn) dom.disconnectBtn.hidden = true;
  }
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
        <span class="empty-state__icon">📋</span>
        <span class="empty-state__text">No actions recorded</span>
      </div>
    `;
    return;
  }
  
  dom.actionLog.innerHTML = log.slice(0, 50).map(item => {
    const statusIcon = {
      executed: '✅',
      failed: '❌',
      pending: '⏳',
      approved: '✅',
      rejected: '🚫',
    }[item.status] ?? '⏳';
    
    const time = new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    return `
      <div class="log-item">
        <span class="log-item__icon">${statusIcon}</span>
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

function setupEventListeners(): void {
  // Input changes
  const inputs = [
    dom.apiKeyInput, dom.approveLow, dom.approveMedium, dom.approveHigh,
    dom.toneSelect, dom.signatureText, dom.userName, dom.maxEmails
  ];
  
  inputs.forEach(input => {
    if (input) {
      input.addEventListener('input', showSaveButton);
      input.addEventListener('change', showSaveButton);
    }
  });

  dom.themeDark?.addEventListener('click', () => {
    if (currentSettings.theme !== 'dark') {
      currentSettings.theme = 'dark';
      updateThemeUI('dark');
      showSaveButton();
    }
  });

  dom.themeLight?.addEventListener('click', () => {
    if (currentSettings.theme !== 'light') {
      currentSettings.theme = 'light';
      updateThemeUI('light');
      showSaveButton();
    }
  });
  
  dom.toggleApiKeyBtn?.addEventListener('click', () => {
    if (!dom.apiKeyInput || !dom.toggleApiKeyBtn) return;
    const type = dom.apiKeyInput.type === 'password' ? 'text' : 'password';
    dom.apiKeyInput.type = type;
    dom.toggleApiKeyBtn.textContent = type === 'password' ? '👁️' : '🙈';
  });
  
  dom.testApiBtn?.addEventListener('click', async () => {
    if (!dom.apiKeyInput || !dom.testApiBtn || !dom.testApiStatus) return;
    const apiKey = dom.apiKeyInput.value.trim();
    if (!apiKey) {
      dom.testApiStatus.textContent = '❌ API Key required';
      dom.testApiStatus.className = 'api-status error';
      return;
    }
    
    dom.testApiBtn.disabled = true;
    dom.testApiStatus.textContent = '⏳ Testing...';
    dom.testApiStatus.className = 'api-status loading';
    
    try {
      // Temporarily set it
      await chrome.storage.local.set({ geminiApiKey: apiKey });
      let res: Response | undefined;
      const retries = 3;
      let delayMs = 1000;
      for (let i = 0; i < retries; i++) {
        try {
          res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
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
            console.warn(`[MailFlow-agent] Gemini API returned ${res.status}. Retrying in ${delayMs}ms... (Attempt ${i + 1}/${retries})`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
            delayMs *= 2;
            continue;
          }
          break;
        } catch (err) {
          if (i === retries - 1) throw err;
          console.warn(`[MailFlow-agent] Fetch failed. Retrying in ${delayMs}ms... (Attempt ${i + 1}/${retries})`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
          delayMs *= 2;
        }
      }
      
      if (res && res.ok) {
        dom.testApiStatus.textContent = '✅ Connection successful';
        dom.testApiStatus.className = 'api-status success';
        showSaveButton();
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
        dom.testApiStatus.textContent = `❌ ${reason}`;
        dom.testApiStatus.className = 'api-status error';
      }
    } catch (e) {
      dom.testApiStatus.textContent = '❌ Network error';
      dom.testApiStatus.className = 'api-status error';
    } finally {
      dom.testApiBtn.disabled = false;
    }
  });
  
  dom.disconnectBtn?.addEventListener('click', async () => {
    if (confirm('Are you sure you want to disconnect your Gmail account?')) {
      await sendToBackground({ type: MESSAGE_TYPES.AUTH_LOGOUT });
      await checkAuthStatus();
    }
  });

  dom.clearLogBtn?.addEventListener('click', async () => {
    if (confirm('Are you sure you want to clear the action log?')) {
      await chrome.storage.local.set({ actionQueue_log: [] });
      renderActionLog([]);
    }
  });
  
  dom.saveFloatBtn?.addEventListener('click', async () => {
    if (!dom.saveFloatBtn) return;
    dom.saveFloatBtn.textContent = 'Saving...';
    
    const newSettings: Settings = {
      ...currentSettings,
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
    
    dom.saveFloatBtn.textContent = '✅ Saved';
    setTimeout(() => {
      hideSaveButton();
    }, 2000);
  });
}

function showSaveButton(): void {
  if (dom.saveFloatBtn) {
    dom.saveFloatBtn.hidden = false;
    dom.saveFloatBtn.textContent = 'Save Changes';
  }
}

function hideSaveButton(): void {
  if (dom.saveFloatBtn) {
    dom.saveFloatBtn.hidden = true;
  }
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
