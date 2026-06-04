import type { GmailMessagePart } from './types';

/**
 * Read the saved theme from chrome.storage and apply it to <html data-theme>.
 * Safe to call from any extension surface (popup, sidepanel, options).
 * Falls back to 'dark' if storage is unavailable.
 */
export async function applyStoredTheme(): Promise<'light' | 'dark'> {
  try {
    const { extension_settings } = (await chrome.storage.local.get('extension_settings')) as {
      extension_settings?: { theme?: 'light' | 'dark' };
    };
    const theme: 'light' | 'dark' = extension_settings?.theme === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
    return theme;
  } catch {
    document.documentElement.dataset.theme = 'light';
    return 'light';
  }
}

/**
 * Decode a base64url-encoded string to UTF-8 text.
 * Gmail API returns body data in this encoding.
 */
export function base64UrlDecode(str: string): string {
  // Replace base64url chars with standard base64
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  // Pad to a multiple of 4
  const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=');
  const binary = atob(padded);
  // Decode UTF-8
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * Encode a string to base64url (no padding).
 * Used when constructing raw MIME messages for the Gmail API.
 */
export function base64UrlEncode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Recursively extract the plain-text body from a Gmail API message payload.
 * Handles multipart messages by walking the parts tree.
 */
export function parseEmailBody(payload: GmailMessagePart | null | undefined): string {
  if (!payload) return '';

  // Direct body on the payload itself
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return base64UrlDecode(payload.body.data);
  }

  // Fallback: try HTML and strip tags
  if (payload.mimeType === 'text/html' && payload.body?.data) {
    const html = base64UrlDecode(payload.body.data);
    return stripHtml(html);
  }

  // Walk multipart children
  if (payload.parts?.length) {
    // Prefer text/plain
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return base64UrlDecode(part.body.data);
      }
    }
    // Recurse into nested multipart
    for (const part of payload.parts) {
      const result = parseEmailBody(part);
      if (result) return result;
    }
  }

  return '';
}

/**
 * Extract specific headers from the Gmail headers array.
 * @param headers  — payload.headers from the Gmail API
 * @param names — header names to extract (case-insensitive)
 * @returns Map of lowercase name → value
 */
export function extractHeaders(
  headers: { name: string; value: string }[] | undefined,
  names: string[] = ['From', 'To', 'Subject', 'Date']
): Record<string, string> {
  if (!headers?.length) return {};
  const wanted = new Set(names.map((n) => n.toLowerCase()));
  const result: Record<string, string> = {};
  for (const header of headers) {
    const key = header.name.toLowerCase();
    if (wanted.has(key)) {
      result[key] = header.value;
    }
  }
  return result;
}

/**
 * Generate a random ID (for action-queue entries, etc.).
 * Uses crypto.randomUUID() with a fallback for environments where it's not available.
 */
export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for older environments
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Strip HTML tags from a string (basic implementation).
 */
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Sanitise email content before sending it to the AI model.
 * - Strips HTML
 * - Limits length
 * - Wraps in a safety boundary
 */
export function sanitizeForAI(text: string, maxLength: number = 12_000): string {
  if (!text) return '';
  let cleaned = stripHtml(text);
  if (cleaned.length > maxLength) {
    cleaned = cleaned.slice(0, maxLength) + '\n[…content truncated…]';
  }
  return [
    '--- BEGIN UNTRUSTED EMAIL CONTENT ---',
    cleaned,
    '--- END UNTRUSTED EMAIL CONTENT ---',
  ].join('\n');
}

interface MimeMessageOptions {
  to: string;
  subject: string;
  body: string;
  inReplyTo?: string;
  references?: string;
  threadId?: string;
}

function sanitizeMimeHeader(value: string, fieldName: string): string {
  const cleaned = String(value ?? '').replace(/[\r\n]+/g, ' ').trim();
  if (!cleaned) {
    throw new Error(`${fieldName} is required`);
  }
  return cleaned;
}

/**
 * Build an RFC 2822 MIME message and return it as a base64url string
 * ready for the Gmail API `messages.send` endpoint.
 */
export function createMimeMessage({ to, subject, body, inReplyTo, references }: MimeMessageOptions): string {
  const lines = [
    `To: ${sanitizeMimeHeader(to, 'To')}`,
    `Subject: ${sanitizeMimeHeader(subject, 'Subject')}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
  ];

  if (inReplyTo) {
    lines.push(`In-Reply-To: ${sanitizeMimeHeader(inReplyTo, 'In-Reply-To')}`);
  }
  if (references) {
    lines.push(`References: ${sanitizeMimeHeader(references, 'References')}`);
  }

  // Blank line separates headers from body
  lines.push('', body);

  const raw = lines.join('\r\n');
  return base64UrlEncode(raw);
}
