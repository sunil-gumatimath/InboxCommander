/**
 * shared/markdown.ts
 * Tiny safe markdown subset for AI chat messages.
 * HTML-escapes input first, then applies a fixed set of transformations.
 * Intentionally NOT a full markdown parser — only the syntax the AI uses.
 */

import { escapeHtml } from './escape';

const CODE_FENCE_RE = /```(?:[a-zA-Z0-9+#-]*\n)?([\s\S]*?)```/g;
const INLINE_CODE_RE = /`([^`\n]+)`/g;
const H1_RE = /^# (.*?)$/gm;
const H2_RE = /^## (.*?)$/gm;
const H3_RE = /^### (.*?)$/gm;
const BOLD_RE = /\*\*([^*]+)\*\*/g;
const ITALIC_RE = /\*([^*]+)\*/g;
const BULLET_RE = /^[-*•]\s+(.+)/;

export function formatMessageText(text: string): string {
  let escaped = escapeHtml(text);

  // 1. Fenced code blocks
  escaped = escaped.replace(CODE_FENCE_RE, '<pre><code>$1</code></pre>');
  // 2. Inline code
  escaped = escaped.replace(INLINE_CODE_RE, '<code>$1</code>');
  // 3. Headers
  escaped = escaped.replace(H3_RE, '<h3>$1</h3>');
  escaped = escaped.replace(H2_RE, '<h2>$1</h2>');
  escaped = escaped.replace(H1_RE, '<h1>$1</h1>');
  // 4. Bold
  escaped = escaped.replace(BOLD_RE, '<strong>$1</strong>');
  // 5. Italic
  escaped = escaped.replace(ITALIC_RE, '<em>$1</em>');
  // 6. Bullet lists
  const lines = escaped.split('\n');
  let inList = false;
  for (let i = 0; i < lines.length; i++) {
    const lineVal = lines[i]!;
    const line = lineVal.trim();
    const match = line.match(BULLET_RE);
    if (match) {
      let prefix = '';
      if (!inList) {
        prefix = '<ul class="message-list">';
        inList = true;
      }
      lines[i] = `${prefix}<li>${match[1]}</li>`;
    } else if (inList) {
      lines[i] = '</ul>' + lineVal;
      inList = false;
    }
  }
  if (inList && lines.length > 0) {
    const lastIdx = lines.length - 1;
    const lastLine = lines[lastIdx]!;
    lines[lastIdx] = lastLine + '</ul>';
  }
  const processed = lines.join('\n');
  // 7. Newlines to <br>, but not inside <pre> blocks
  const parts = processed.split(/(<\/pre>|<pre>)/g);
  let inPre = false;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    if (part === '<pre>') inPre = true;
    else if (part === '</pre>') inPre = false;
    else if (!inPre) parts[i] = part.replace(/\n/g, '<br>');
  }
  return parts.join('');
}
