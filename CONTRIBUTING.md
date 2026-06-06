# Contributing to InboxCommander

Thanks for your interest in InboxCommander. This document covers the day-to-day workflow for contributing code, tests, and documentation.

## Development setup

1. **Install [Bun](https://bun.sh)** (>= 1.0.0). This project uses Bun for both the package manager and the test runner. npm/yarn/pnpm will not be supported.
2. **Clone and install:**
   ```bash
   git clone <repo-url>
   cd mailflow-ai-agent
   bun install
   ```
3. **Create your `.env`:**
   ```bash
   bun run setup
   ```
   Then edit `.env` and replace `your_client_id_here_...apps.googleusercontent.com` with a real Chrome-extension OAuth client ID from the [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
4. **Run dev mode** (auto-reloads on file changes):
   ```bash
   bun run dev
   ```
5. **Load the unpacked extension** in Chrome at `chrome://extensions`, pointing at the project root.

## Project layout

```
src/
├── background/     # Service worker, Gmail API, AI provider, action queue
├── content/        # Injected into mail.google.com
├── options/        # Settings page
├── popup/          # Toolbar popup
├── sidepanel/      # Main chat UI
├── shared/         # Cross-cutting utilities (storage, messaging, escape, markdown, retry, utils)
└── manifest.json   # Extension manifest
```

`src/shared/` is the only place for code reused across surfaces. If you find yourself copy-pasting logic between popup, options, and sidepanel, extract it to `shared/` instead.

## Scripts

| Command                 | Purpose                                                |
| ----------------------- | ------------------------------------------------------ |
| `bun run dev`           | Vite dev server with auto-reload                       |
| `bun run typecheck`     | `tsc --noEmit` — strict mode, all errors must be fixed |
| `bun run test`          | One-shot Vitest run                                    |
| `bun run test:watch`    | Vitest watch mode                                      |
| `bun run test:coverage` | Vitest with v8 coverage report                         |
| `bun run lint`          | ESLint 9 flat config                                   |
| `bun run format`        | Prettier auto-fix                                      |
| `bun run format:check`  | Prettier check (CI uses this)                          |
| `bun run clean`         | Remove built artifacts at repo root                    |
| `bun run build`         | Production build (typecheck + Vite)                    |

## Code style

- **TypeScript strict mode** is enforced, including `noUnusedLocals` and `noUnusedParameters`. Fix dead code at the source — do not silence with `// @ts-ignore` or `// eslint-disable` unless absolutely necessary (and add a comment explaining why).
- **Prettier** handles all formatting. Run `bun run format` before committing. CI fails if `format:check` finds any unformatted files.
- **ESLint** enforces code-quality rules. `bun run lint` must pass.
- Use `import type { ... }` for type-only imports — `verbatimModuleSyntax` is on.
- Prefer `const` over `let`. Prefer pure functions over stateful classes.

## Testing

Tests live next to the code they cover, in `*.test.ts` files. Vitest's environment is `node`; the `chrome.*` APIs are mocked in each test using a per-file `chrome` mock.

Conventions:

- Use `beforeAll` to set up the chrome mock once per file (not `beforeEach` — `vi.stubGlobal` is fragile across test runs).
- Use `vi.mock('./module-name', ...)` at the top of the file to stub module imports.
- For shared utilities, prefer testing behavior over implementation. For the action queue, exercise the full state machine (`queueAction` → `approveAction` → `getActionLog`).

Run a single file:

```bash
bun run test src/shared/storage.test.ts
```

## Pull request workflow

1. **Branch** off `main`.
2. **Make your changes** with tests where applicable.
3. **Verify locally**:
   ```bash
   bun run lint
   bun run typecheck
   bun run test
   bun run build
   ```
   All four must succeed.
4. **Commit** with a clear message. The conventional-commits format is encouraged but not required.
5. **Push** and **open a PR** against `main`. CI will run lint, typecheck, tests, and a build.
6. **Address review feedback.** Squash-fixup commits are fine; we'll squash-merge on accept.

## Reporting bugs

Open a GitHub issue with:

- Reproduction steps
- Expected vs actual behavior
- Browser version, extension version
- Relevant console output (from `chrome://extensions` → InboxCommander → "service worker" → "Inspect")

## Security issues

See [SECURITY.md](SECURITY.md) — do **not** open a public issue for security reports.
