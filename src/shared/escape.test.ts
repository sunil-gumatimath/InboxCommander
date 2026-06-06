import { describe, it, expect } from 'vitest';
import { escapeHtml } from './escape';

describe('escapeHtml', () => {
  it('escapes ampersands', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('escapes angle brackets', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
  });

  it('escapes quotes', () => {
    expect(escapeHtml('"hi"')).toBe('&quot;hi&quot;');
    expect(escapeHtml("it's")).toBe('it&#39;s');
  });

  it('returns empty string for non-string input', () => {
    expect(escapeHtml(null as unknown as string)).toBe('');
    expect(escapeHtml(undefined as unknown as string)).toBe('');
    expect(escapeHtml(42 as unknown as string)).toBe('');
  });

  it('leaves safe text alone', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });
});
