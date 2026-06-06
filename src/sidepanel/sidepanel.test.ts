/**
 * Regression tests for the side panel's "Summarize This Email" feature.
 *
 * Strategy (no jsdom — node environment):
 *  - Read the sidepanel HTML and CSS as plain strings and assert that the
 *    new primary button is present, correctly labeled, wired to the
 *    existing data-ctx-action click handler, and styled prominently.
 *  - Assert the legacy small "Summarize" chip in the context banner was
 *    replaced (no double triggers / no ambiguity with the inbox chip).
 *  - Assert the other 4 context actions (Reply / Archive / Label / Trash)
 *    are still present so we don't regress the mutating-action row.
 *  - Assert the popup flow still has a matching `SUMMARIZE_EMAIL` button
 *    so the two surfaces stay in sync.
 *
 * Why this granularity:
 *  - A full click→chrome.tabs→service-worker→Gemini roundtrip would need
 *    a complete jsdom + chrome.* + gmailApi mock stack. The 9 tests in
 *    `ai-provider.summarize.test.ts` already cover the Gemini layer; this
 *    file covers the UI wiring layer that wraps it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const sidepanelHtml = readFileSync(join(ROOT, 'src', 'sidepanel', 'sidepanel.html'), 'utf8');
const sidepanelCss = readFileSync(join(ROOT, 'src', 'sidepanel', 'sidepanel.css'), 'utf8');
const popupHtml = readFileSync(join(ROOT, 'src', 'popup', 'popup.html'), 'utf8');
const contentTs = readFileSync(join(ROOT, 'src', 'content', 'content.ts'), 'utf8');
const serviceWorkerTs = readFileSync(join(ROOT, 'src', 'background', 'service-worker.ts'), 'utf8');

describe('sidepanel — "Summarize This Email" primary action', () => {
  it('renders a primary-styled Summarize This Email button inside the email context banner', () => {
    // Extract the #emailContext block so the assertions are scoped to it
    const ctxMatch = sidepanelHtml.match(/<div class="email-context"[^>]*id="emailContext"[^>]*>([\s\S]*?)<\/div>\s*<!--/);
    expect(ctxMatch, '#emailContext block must exist in sidepanel.html').toBeTruthy();
    const ctx = ctxMatch![1]!;

    expect(ctx).toContain('class="ctx-primary-action"');
    expect(ctx).toMatch(/<span>\s*Summarize This Email\s*<\/span>/);
    expect(ctx).toContain('data-ctx-action="SUMMARIZE_EMAIL"');
    expect(ctx).toMatch(/title="Summarize the email currently open in Gmail"/);
  });

  it('uses an inline SVG icon (no extra HTTP request, no missing-asset risk)', () => {
    const ctxMatch = sidepanelHtml.match(/<div class="email-context"[^>]*id="emailContext"[^>]*>([\s\S]*?)<\/div>\s*<!--/);
    const ctx = ctxMatch![1]!;
    // The primary button should embed an inline SVG (consistent with the rest of the file)
    expect(ctx).toMatch(/<button class="ctx-primary-action"[\s\S]*?<svg[\s\S]*?<\/svg>/);
  });

  it('removes the legacy "Summarize" chip from the context actions row (no duplicate triggers)', () => {
    const ctxMatch = sidepanelHtml.match(/<div class="email-context"[^>]*id="emailContext"[^>]*>([\s\S]*?)<\/div>\s*<!--/);
    const ctx = ctxMatch![1]!;
    // The old "Summarize" chip lived inside .ctx-actions; we promoted it to the
    // primary button. Make sure a chip with the same data-ctx-action wasn't left behind.
    expect(ctx).not.toMatch(/<button class="chip"[^>]*data-ctx-action="SUMMARIZE_EMAIL"/);
  });

  it('keeps the other 4 context actions (Reply, Archive, Label, Trash) so we do not regress the mutating row', () => {
    const ctxMatch = sidepanelHtml.match(/<div class="email-context"[^>]*id="emailContext"[^>]*>([\s\S]*?)<\/div>\s*<!--/);
    const ctx = ctxMatch![1]!;
    for (const action of ['DRAFT_REPLY', 'ARCHIVE_EMAIL', 'LABEL_EMAIL', 'TRASH_EMAIL']) {
      expect(ctx, `expected ${action} chip in context actions`).toContain(
        `data-ctx-action="${action}"`,
      );
    }
  });

  it('is hidden by default (button is inside the #emailContext block which is `hidden`)', () => {
    // The email context block carries the `hidden` attribute by default; the
    // primary button must NOT override that, so a Gmail-less user does not see it.
    expect(sidepanelHtml).toMatch(/<div class="email-context"[^>]*\bhidden\b/);
    // The primary button itself should not be marked hidden on its own —
    // visibility must remain governed by the parent block.
    const primaryButtonMatch = sidepanelHtml.match(/<button class="ctx-primary-action"[^>]*>/);
    expect(primaryButtonMatch![0]!).not.toContain(' hidden');
  });
});

describe('sidepanel — CSS for the primary action', () => {
  it('defines a `.ctx-primary-action` rule with the expected visual properties', () => {
    const block = sidepanelCss.match(/\.ctx-primary-action\s*\{([\s\S]*?)\}/);
    expect(block, '.ctx-primary-action rule must exist').toBeTruthy();
    const rules = block![1]!;
    expect(rules).toMatch(/width:\s*100%/);
    expect(rules).toMatch(/background:\s*var\(--accent\)/);
    expect(rules).toMatch(/display:\s*flex/);
    expect(rules).toMatch(/cursor:\s*pointer/);
  });

  it('provides a hover variant and a disabled variant (consistency with other action buttons)', () => {
    expect(sidepanelCss).toMatch(/\.ctx-primary-action:hover\s*\{/);
    expect(sidepanelCss).toMatch(/\.ctx-primary-action:disabled\s*\{/);
  });
});

describe('popup — "Summarize This Email" stays in sync with the side panel', () => {
  it('still exposes a Summarize This Email button at the popup level', () => {
    expect(popupHtml).toContain('id="btnSummarizeCurrent"');
    expect(popupHtml).toMatch(/Summarize This Email/);
  });
});

/**
 * Regression guard for the "button is disabled / invisible when on an open
 * email" bug. Root cause was the content script and service worker both
 * gating the Gmail API call + context broadcast on `isValidHexId` (15–18
 * char hex). Modern Gmail uses base64url thread IDs in the URL hash (e.g.
 * `18d9…`), so the gate rejected every real-world email.
 *
 * Fix:
 *  - Content script sets `currentThreadId` from the URL hash directly and
 *    fires `EMAIL_CONTEXT_UPDATE` immediately when entering a thread view
 *    (no longer gated on `subject || from`).
 *  - Service worker accepts any non-empty ID (no `isValidHexId` check) and
 *    tries `gmailApi.getThread(base64url)`.
 *
 * These tests read the source files as strings and assert the structure
 * so a future "tighten the gate" regression cannot slip back in.
 */
describe('regression — content script propagates the open-email context to the side panel', () => {
  it('GMAIL_THREAD_REGEX accepts base64url IDs (the modern Gmail URL format), not only hex', () => {
    // The regex must include A-Z and a-z (base64url alphabet), not just 0-9a-f.
    const regexMatch = contentTs.match(/GMAIL_THREAD_REGEX\s*=\s*(\/.+\/)/);
    expect(regexMatch, 'GMAIL_THREAD_REGEX must be defined in content.ts').toBeTruthy();
    const pattern = regexMatch![1]!;
    // Must allow both upper and lower case letters, not just hex characters.
    expect(pattern).toMatch(/\[A-Za-z/);
    // Must allow at least 15+ characters (modern Gmail thread IDs are 16+ chars).
    expect(pattern).toMatch(/\{15,\}/);
  });

  it('fires EMAIL_CONTEXT_UPDATE immediately on entering a thread view (not gated on DOM extraction)', () => {
    // Extract the `view === \'thread\' && ctx.threadId` branch of onContextChange.
    const branch = contentTs.match(
      /if \(ctx\.view === 'thread' && ctx\.threadId\)\s*\{([\s\S]*?)\}\s*else if \(ctx\.view === 'compose'\)/,
    );
    expect(branch, 'thread branch of onContextChange must exist').toBeTruthy();
    const body = branch![1]!;
    // The branch must send EMAIL_CONTEXT_UPDATE synchronously, not wait
    // for extractThreadMetadata to resolve subject/from.
    expect(body).toContain("type: 'EMAIL_CONTEXT_UPDATE'");
    // And it must not be wrapped in `if (subject || from)` — that gate
    // was the second half of the bug.
    expect(body).not.toMatch(/if\s*\(\s*subject\s*\|\|\s*from\s*\)/);
  });

  it('extractThreadMetadata now sends EMAIL_CONTEXT_UPDATE unconditionally (not gated on subject||from)', () => {
    // The fix replaced `if (subject || from) { safeSendMessage({...}) }` with
    // an always-on send. Make sure the gate is gone.
    expect(contentTs).not.toMatch(/if\s*\(\s*subject\s*\|\|\s*from\s*\)\s*\{[\s\S]*?EMAIL_CONTEXT_UPDATE/);
  });

  it('no longer rejects the URL threadId when it is not pure hex', () => {
    // The `if (isValidHexId(resolvedThreadId)) { currentThreadId = ... }`
    // gate used to drop the threadId for base64url URLs, so the side panel
    // never received context. The fix assigns currentThreadId from the URL
    // hash directly in onContextChange, before extractThreadMetadata runs.
    expect(contentTs).toMatch(/currentThreadId\s*=\s*ctx\.threadId/);
  });
});

/**
 * Regression guard for the "I edited the source but never rebuilt, so the
 * running extension in Chrome is stale" failure mode. The vite config writes
 * the built files into the project root (`sidepanel/sidepanel.html`,
 * `popup/popup.html`), so a `bun run build` that runs *before* the user
 * reloads the extension in `chrome://extensions` is what makes a code
 * change visible.
 *
 * The `it.runIf(...)` guard means `bun run test` is still runnable
 * standalone (e.g. in CI before the build step), but the moment the
 * built artifact exists, the test pins its contents.
 */
describe('built extension files contain the new buttons (rebuild required)', () => {
  it.runIf(existsSync(join(ROOT, 'sidepanel', 'sidepanel.html')))(
    'built sidepanel/sidepanel.html has the Summarize This Email primary button',
    () => {
      const built = readFileSync(join(ROOT, 'sidepanel', 'sidepanel.html'), 'utf8');
      expect(built).toContain('class="ctx-primary-action"');
      expect(built).toMatch(/Summarize This Email/);
      expect(built).toContain('data-ctx-action="SUMMARIZE_EMAIL"');
    },
  );

  it.runIf(existsSync(join(ROOT, 'popup', 'popup.html')))(
    'built popup/popup.html has the Summarize This Email popup button',
    () => {
      const built = readFileSync(join(ROOT, 'popup', 'popup.html'), 'utf8');
      expect(built).toContain('id="btnSummarizeCurrent"');
      expect(built).toMatch(/Summarize This Email/);
    },
  );
});

describe('regression — service worker resolves the open email for both hex and base64url IDs', () => {
  it('GMAIL_CONTEXT_CHANGE handler does not gate on isValidHexId', () => {
    // The old gate was `isValidHexId(emailId)` / `isValidHexId(threadId)`.
    // We assert the gate is gone and the replacement is present. We use a
    // whole-file search because the case body has deeply nested braces that
    // are hard to scope precisely with a regex.
    expect(serviceWorkerTs).not.toMatch(/isValidHexId\s*\(\s*emailId\s*\)/);
    expect(serviceWorkerTs).not.toMatch(/isValidHexId\s*\(\s*threadId\s*\)/);
    // The replacement `hasUsableId` helper is present.
    expect(serviceWorkerTs).toMatch(/hasUsableId/);
  });

  it('falls back from getMessage to getThread when the emailId is missing or fails', () => {
    // Both calls are made in the GMAIL_CONTEXT_CHANGE handler; getMessage
    // is tried first, then getThread as fallback.
    expect(serviceWorkerTs).toMatch(/gmailApi\.getMessage\(emailId\)/);
    expect(serviceWorkerTs).toMatch(/gmailApi\.getThread\(threadId\)/);
  });
});
