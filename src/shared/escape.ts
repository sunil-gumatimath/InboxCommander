/**
 * shared/escape.ts
 * HTML escape for safe insertion into innerHTML.
 * Use this whenever interpolating untrusted text into a template string
 * that gets assigned to innerHTML.
 */

const ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(str: unknown): string {
  if (typeof str !== 'string') return '';
  return str.replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch]!);
}
