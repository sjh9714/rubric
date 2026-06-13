# AGENTS.md

## Project

`rubric` is a local-first TypeScript CLI and GitHub Action for preflight checks on AI-generated pull requests.

Rubric will:

- turn repeated PR feedback into version-controlled rules
- check current diffs against deterministic rules
- compile rules into AGENTS.md, CLAUDE.md, GitHub Copilot instructions, Cursor rules, and PR templates
- work without LLM API keys for core commands

## Product Principles

- Do not position Rubric as an AI code detector.
- Do not build employee scoring, reviewer cloning, or surveillance features.
- Prefer "team review memory", "review rubric", and "preflight checks".
- Core commands must work without network access unless the command explicitly needs GitHub.
- Deterministic findings may fail CI.
- LLM or semantic findings must default to warning/comment-only.
- Telemetry must be disabled by default.

## Tech Stack

- TypeScript with strict mode
- Node.js 20+
- pnpm workspaces
- Vitest for tests
- tsup for builds
- ESLint and Prettier for code quality

## Repository Layout

- `apps/cli`: CLI entrypoint and command wiring
- `packages/core`: config, rules, git diff, findings, and reports
- `packages/compiler`: renderers for agent instruction files and PR templates
- `packages/github`: future GitHub mining and Action helpers
- `packages/llm`: optional LLM integrations
- `packages/action`: future GitHub Action wrapper
- `packages/packs`: future built-in rule packs

## Development Commands

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm lint
```

## Coding Conventions

- Keep CLI formatting separate from core logic.
- Prefer small pure functions in packages.
- Validate future YAML config with schema validation before use.
- Avoid production dependencies unless they clearly simplify the implementation.
- Write tests for public behavior before implementation.

## Done Criteria

Before summarizing work, run:

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm lint
```
