import { describe, it, expect } from 'vitest';
import { formatMessageText } from './markdown';

describe('formatMessageText', () => {
  it('escapes HTML in input', () => {
    const out = formatMessageText('<script>alert(1)</script>');
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
  });

  it('renders fenced code blocks', () => {
    const out = formatMessageText('```js\nconst x = 1;\n```');
    expect(out).toContain('<pre><code>');
    expect(out).toContain('const x = 1;');
  });

  it('renders inline code', () => {
    const out = formatMessageText('use `foo()` here');
    expect(out).toContain('<code>foo()</code>');
  });

  it('renders headers', () => {
    expect(formatMessageText('# h1')).toContain('<h1>h1</h1>');
    expect(formatMessageText('## h2')).toContain('<h2>h2</h2>');
    expect(formatMessageText('### h3')).toContain('<h3>h3</h3>');
  });

  it('renders bold and italic', () => {
    expect(formatMessageText('**bold**')).toContain('<strong>bold</strong>');
    expect(formatMessageText('*em*')).toContain('<em>em</em>');
  });

  it('renders bullet lists', () => {
    const out = formatMessageText('- a\n- b\n- c');
    expect(out).toContain('<ul class="message-list">');
    expect(out).toContain('<li>a</li>');
    expect(out).toContain('<li>b</li>');
    expect(out).toContain('<li>c</li>');
    expect(out).toContain('</ul>');
  });

  it('preserves newlines outside code blocks', () => {
    const out = formatMessageText('line 1\n\nline 2');
    expect(out).toContain('line 1');
    expect(out).toContain('line 2');
  });
});
