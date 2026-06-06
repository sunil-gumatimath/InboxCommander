# Changelog

All notable changes to InboxCommander are documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **Tests:** Vitest 2 test runner with v8 coverage. 45 tests across 7 files covering shared utilities (`sanitizeForAI`, `escapeHtml`, `retry`, `messaging`, `markdown`, `storage`) and the action-queue state machine (`queueAction`, `approveAction`, `rejectAction`, `editAction`, `clearActionLog`).
- **Linting:** ESLint 9 flat config + Prettier 3. CI runs both on every PR.
- **Typed storage layer:** `src/shared/storage.ts` is the single entry point for `chrome.storage.local` reads/writes. Typed accessors: `getSettings`, `updateSettings`, `getApiKey`, `setApiKey`, `getPendingActions`, `setPendingActions`, `getActionLog`, `appendLogEntry`, `clearActionLog`.
- **Shared helpers:** `sendToBackground` (messaging), `escapeHtml` (XSS-safe HTML escaping), `formatMessageText` (safe markdown subset), and `withBackoff` (retry helper) extracted to `src/shared/`. The popup, options, and side panel now import them.
- **CI workflows:** `.github/workflows/ci.yml` has separate jobs for `lint`, `typecheck`, `test`, and `build`. The `build` job depends on the other three and uses a placeholder OAuth client ID so the pipeline itself is verifiable.
- **Scripts:** `bun run test`, `bun run test:watch`, `bun run test:coverage`, `bun run lint`, `bun run format`, `bun run format:check`, `bun run clean`.

### Changed

- **TypeScript strictness:** `noUnusedLocals` and `noUnusedParameters` are now `true`. Dead code is caught at typecheck. Pre-existing dead code (`$$` in `sidepanel.ts`, `PLACEHOLDER` in `vite.config.ts`) was removed.
- **Migrations:** Popup, options, and side panel no longer define local `sendToBackground`, `escapeHtml`, or `formatMessageText` — they import from `src/shared/`.

### Removed

- Triplicated `sendToBackground` (one in each UI surface).
- Triplicated `escapeHtml` (one in options, one in side panel, plus DOM-based vs entity-based variants).
- Local `formatMessageText` in `sidepanel.ts` (now `src/shared/markdown.ts`).

## [1.0.0] — 2026-06-05

### Initial release

- AI-powered email assistant for Gmail with a side panel chat interface.
- Supported actions: archive, trash, label, mark read, star/unstar, batch modify, draft, send reply, summarize.
- Risk-gated approval flow: low-risk actions can be auto-executed; medium and high require explicit user approval.
- Settings page for API key, model selection, writing tone, and email signature.
- 500-entry rolling action log.
- Local-storage only — no server, no telemetry.
- Manifest v3, Chrome extension.
