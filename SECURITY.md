# Security

InboxCommander is a Chrome extension that reads, summarizes, classifies, drafts, and modifies your Gmail. Security is therefore the most important non-functional concern of this project. This document describes what we do, what you should be aware of, and how to report a vulnerability.

## Threat model

InboxCommander handles three classes of sensitive data:

1. **Your email content** — read from `mail.google.com` via the Gmail API and (for the active thread) via a content script.
2. **Your Gemini API key** — used to call Google's generative-language API.
3. **OAuth tokens** for your Google account — used to call the Gmail API.

Each of these crosses at least one trust boundary:

| Boundary                        | Mitigation                                                                                    |
| ------------------------------- | --------------------------------------------------------------------------------------------- |
| Email content → AI prompt       | HTML stripped, length-bounded, wrapped in `--- BEGIN/END UNTRUSTED EMAIL CONTENT ---` markers |
| Email content → innerHTML in UI | All interpolations go through `escapeHtml` (entity-based, not DOM-based)                      |
| AI response → action execution  | All state-mutating actions go through the action queue with explicit user approval            |
| OAuth client secret             | Stored only in your local `.env` (gitignored) or as a CI secret; never committed              |
| API key                         | Stored in `chrome.storage.local`; never logged; never sent to a third party                   |

## What we do not do

- **No telemetry, no analytics, no remote logging.** This extension does not call any server other than `mail.google.com`, `gmail.googleapis.com`, and `generativelanguage.googleapis.com`.
- **No background data exfiltration.** The service worker only processes messages from the extension's own UI surfaces.
- **No `eval`, `new Function`, or remote-loaded code.** All code is bundled at build time.

## Permissions

The manifest declares the minimum permissions needed:

- `storage` — to persist settings and the action log in `chrome.storage.local`.
- `sidePanel` — to host the chat UI in Chrome's side panel.
- `tabs` and `activeTab` — to detect when you are on Gmail and offer the side panel.
- `identity` — to perform OAuth.

Host permissions are scoped to:

- `https://mail.google.com/*` (the Gmail UI)
- `https://gmail.googleapis.com/*` (the Gmail REST API)
- `https://generativelanguage.googleapis.com/*` (the Gemini API)

We do not request `<all_urls>` or any other broad host permission.

## AI prompt injection

Email content is the primary prompt-injection vector. We mitigate this with:

1. **HTML stripping** in `src/shared/utils.ts:sanitizeForAI` before any content reaches the model.
2. **Length bounding** (default 12,000 chars) to keep injection payloads short.
3. **A safety boundary** (`--- BEGIN/END UNTRUSTED EMAIL CONTENT ---`) so the model can be told to ignore instructions inside that block.
4. **Action approval** — even if the model is tricked into _wanting_ to take a destructive action, the action must still pass the user-approval gate (see `src/background/action-queue.ts`).

These mitigations are not perfect. **You should always review pending actions before approving them**, especially for `SEND_EMAIL` and `TRASH_EMAIL`.

## Reporting a vulnerability

**Do not open a public GitHub issue for security reports.** Instead, email the maintainer directly (see the GitHub profile on this repo) with:

1. A description of the vulnerability and its impact.
2. A minimal reproduction (extension version, browser, steps).
3. Whether you want public credit in the fix's commit message.

We will acknowledge within 72 hours and aim to ship a fix within 14 days for critical issues.

## Scope

In-scope:

- Code execution via the AI prompt path.
- XSS in the side panel / options / popup / content script.
- OAuth token leakage (e.g., token being logged, sent to a non-Google host).
- Storage poisoning (one extension surface corrupting data read by another).
- Manifest issues (over-broad permissions, missing CSP).

Out of scope:

- Bugs in Gmail itself.
- Bugs in the Gemini API.
- Social engineering against the user (this extension cannot protect against a user who approves every action blindly).
- Vulnerabilities in dependencies that are not reachable from the extension's code.
