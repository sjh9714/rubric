# rubric

Preflight checks for AI-generated pull requests.

Rubric will turn a team's repeated PR feedback into version-controlled rules, then help Claude, Codex, Copilot, Cursor, and human authors catch predictable issues before review.

This repository is currently in bootstrap mode. The first milestone is a local-first TypeScript CLI with deterministic checks and no required API keys.

## Principles

- Local-first core commands
- No LLM calls by default
- No telemetry by default
- No AI code detection claims
- No employee scoring or surveillance features
- Deterministic policy findings may fail CI
- Semantic or LLM findings default to warnings

## Current CLI

```bash
npx rubric doctor
npx rubric init
npx rubric add-pack --list
npx rubric add-pack testing migrations security
npx rubric check --base main
npx rubric compile
```

Implemented:

- `rubric doctor`
- `rubric init`
- `rubric add-pack`
- `rubric check`
- `rubric compile`

Planned:

- `rubric demo`
- GitHub PR history mining
- evidence-linked rule proposals
- optional LLM-assisted extraction

## Quick local usage

```bash
npx rubric doctor
npx rubric init
npx rubric add-pack testing migrations security
npx rubric check --base main
npx rubric compile
```

Core commands are local-first and do not require API keys.

## Development

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm lint
```

Run the current CLI in development:

```bash
pnpm --filter @rubric-dev/cli dev --help
```

## v0.1 Roadmap

1. Bootstrap the TypeScript monorepo and CLI shell.
2. Add config and rule schemas.
3. Collect git diffs and evaluate deterministic rules.
4. Add built-in rule packs, generated GitHub workflow support, and `init`.
5. Implement `demo`.

Future milestones will add GitHub PR history mining, evidence-linked rule proposals, and optional LLM-assisted extraction.
