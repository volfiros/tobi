# Repository Guidelines

## Project Workflow

- Do not create new worktrees for this project. Work in the existing checkout on
  the current branch unless explicitly asked otherwise.
- Do not create new branches unless explicitly requested.
- Preserve existing style, naming, organization, and framework patterns.
- Keep changes scoped. Avoid unrelated refactors, formatting churn, or dependency
  changes unless required.
- Prefer existing utilities, components, configuration, and project conventions
  over new abstractions.

## Project Structure & Module Organization

This repository is in planning stage. Main reference:
`references/tobi_chatbot_implementation_plan.md`, which describes a TypeScript
Cloudflare Workers app for WhatsApp-native print ordering.

Keep planning and architecture references in `references/`. When code is added,
prefer `src/` for Worker code, `src/routes/` for webhook/API routes,
`src/services/` for Twilio, Gemini, payment, storage, and notifications,
`src/db/` for D1 schema/migrations, and `test/` or `tests/` for tests.

Store generated design images, Stitch exports, screenshots, and mockups in
`design/`; ignore generated files, but track `design/README.md`. Store local-only
plans, exported references, and scratch notes in ignored `docs/`.

## Build, Test, and Development Commands

Use Bun as default package manager. No build tooling is committed yet; keep
commands current once added.

- `bun install` installs dependencies.
- `bun run dev` starts the local Cloudflare Worker development server.
- `bun test` runs the test suite.
- `bun run lint` checks TypeScript and formatting rules.
- `bun run build` verifies the production build.

## Coding Style & Naming Conventions

Use TypeScript. Prefer small modules, explicit exports, runtime validation for
external payloads, and deterministic backend logic for pricing, payments, and
order state. Use `camelCase` for variables/functions, `PascalCase` for
classes/types, and `SCREAMING_SNAKE_CASE` for constants.

Use 2-space indentation until a formatter exists. Keep comments useful. Never
hard-code secrets, tokens, private keys, or environment-specific values.

## Testing Guidelines

Add or update tests when behavior or shared logic changes. Prioritize webhook
normalization, order transitions, pricing rules, payment idempotency, and AI
fallbacks. Use names such as `createsOrderAfterPaidWebhook`.

Run the relevant formatter, linter, type checker, or tests when practical before
reporting completion.

## Git And GitHub

Do not commit, push, open, merge, close, or modify pull requests without explicit
permission. Before committing, summarize staged changes and wait for approval.
Do not use commit descriptions or co-author trailers.

Use conventional commit prefixes: `feat:`, `fix:`, `perf:`, `docs:`, `chore:`,
`refactor:`, `test:`, `style:`, `build:`, or `ci:`.

Pull requests should summarize changes, list validation performed, link related
issues when available, and include screenshots for dashboard UI changes.
