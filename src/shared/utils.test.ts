import { describe, it, expect } from 'vitest';
import { sanitizeForAI } from './utils';

describe('sanitizeForAI', () => {
  it('returns empty string for empty input', () => {
    expect(sanitizeForAI('')).toBe('');
  });

  it('returns empty string for nullish input', () => {
    expect(sanitizeForAI(null as unknown as string)).toBe('');
    expect(sanitizeForAI(undefined as unknown as string)).toBe('');
  });

  it('strips HTML tags', () => {
    const out = sanitizeForAI('<p>hello <strong>world</strong></p>');
    expect(out).toContain('hello');
    expect(out).toContain('world');
    expect(out).not.toContain('<');
  });

  it('removes script blocks entirely (with their JS payload)', () => {
    const out = sanitizeForAI('<script>alert(1)</script>safe');
    expect(out).not.toContain('alert');
    expect(out).not.toContain('<script>');
    expect(out).toContain('safe');
  });

  it('removes style blocks', () => {
    const out = sanitizeForAI('<style>body{color:red}</style>visible');
    expect(out).not.toContain('color');
    expect(out).toContain('visible');
  });

  it('decodes common HTML entities', () => {
    const out = sanitizeForAI('a &amp; b &lt; c &gt; d &quot;e&quot; f&#39;s');
    expect(out).toContain('a & b');
    expect(out).toContain('< c');
    expect(out).toContain('> d');
    expect(out).toContain('"e"');
    expect(out).toContain("'s");
  });

  it('wraps content in a safety boundary', () => {
    const out = sanitizeForAI('hello');
    expect(out).toContain('--- BEGIN UNTRUSTED EMAIL CONTENT ---');
    expect(out).toContain('--- END UNTRUSTED EMAIL CONTENT ---');
    expect(out.indexOf('--- BEGIN UNTRUSTED EMAIL CONTENT ---')).toBeLessThan(
      out.indexOf('--- END UNTRUSTED EMAIL CONTENT ---'),
    );
  });

  it('truncates content that exceeds maxLength', () => {
    const long = 'x'.repeat(20_000);
    const out = sanitizeForAI(long, 100);
    expect(out.length).toBeLessThan(2_000);
    expect(out).toContain('…content truncated…');
  });

  it('does not truncate content within maxLength', () => {
    const out = sanitizeForAI('short content', 1000);
    expect(out).not.toContain('…content truncated…');
    expect(out).toContain('short content');
  });

  it('collapses runs of 3+ newlines to 2', () => {
    const out = sanitizeForAI('a\n\n\n\n\nb');
    expect(out).toMatch(/a\n\nb/);
  });
});
