# InboxCommander — Privacy Policy

**Effective:** 2026-06-04

InboxCommander is a Chrome extension that helps you triage, summarize, classify, draft, and reply to Gmail messages using Google AI (Gemini). This policy describes what the extension accesses, stores, and transmits.

## TL;DR

- **No backend.** The extension runs entirely in your browser. We do not operate any servers.
- **No telemetry.** No analytics, no tracking, no third-party data sharing.
- **Local-only storage.** All settings, the action log, and your Gemini API key are stored in `chrome.storage.local` on your device.
- **Direct API calls only.** The only network requests the extension makes are to Google's Gmail API and Google's Gemini API, using your OAuth token and your Gemini API key.

## What the extension accesses

When you connect your Google account, the extension requests these OAuth scopes:

| Scope | Why |
|---|---|
| `https://www.googleapis.com/auth/gmail.modify` | Read, label, archive, and trash messages you ask it to |
| `https://www.googleapis.com/auth/gmail.send` | Send drafts and replies you approve |
| `https://www.googleapis.com/auth/gmail.labels` | Apply labels to messages you ask it to |

These scopes are used **only** for actions you explicitly trigger or approve through the extension's UI. There is no background harvesting of email content.

When you use an AI feature (summarize, classify, draft, chat), the relevant email content and your prompt are sent to **Google's Gemini API** using your own Gemini API key, which is stored locally in your browser.

## What is stored locally (`chrome.storage.local`)

- **Extension settings** — your writing tone, signature, name, model choice, approval preferences
- **Gemini API key** — encrypted at rest by Chrome's storage isolation
- **Action queue** — pending actions awaiting your approval
- **Action log** — the last 500 actions you approved, rejected, or that failed (you can clear this from the settings page)

Nothing else is stored. No cookies, no fingerprinting, no cross-site state.

## What is NOT done

- ❌ No analytics or telemetry of any kind
- ❌ No email content is sent to any server other than Google's Gmail and Gemini APIs
- ❌ No data is sold, shared, or transferred to any third party
- ❌ No background reading of your inbox — the extension only reads messages you point it at (current open thread, inbox quick actions, or messages returned by a search you ran)
- ❌ No remote code execution — the bundled JavaScript is the only code that runs; no code is fetched at runtime

## Permissions explained

- `identity` — perform the OAuth handshake with Google
- `storage` — store settings and the action log locally
- `sidePanel` — show the AI chat in Chrome's side panel
- `tabs` — detect when you're on Gmail so the side panel can hydrate
- `alarms` — reserved for future scheduled-task features (currently unused)
- `activeTab` — interact with the open Gmail tab when you click the toolbar icon

Host permissions are limited to `mail.google.com`, `gmail.googleapis.com`, and `generativelanguage.googleapis.com`.

## Your control

- **Disconnect** — Go to the extension's settings page → Disconnect. This revokes the OAuth token.
- **Clear the action log** — Settings page → Clear log.
- **Uninstall** — Removes the extension and all data it stored.
- **Revoke via Google** — https://myaccount.google.com/permissions → InboxCommander → Remove access.

## Children

The extension is not directed at children under 13 and we do not knowingly collect any data from children.

## Changes to this policy

Material changes will be posted to the project's GitHub repository with a date stamp. Continued use of the extension after a change constitutes acceptance.

## Contact

Open an issue at the project's GitHub repository: https://github.com/sunil-gumatimath/InboxCommander/issues
