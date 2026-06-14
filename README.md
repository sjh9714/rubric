# rubric

Preflight checks for AI-generated pull requests.

```bash
npx @rubric-dev/cli demo
```

Rubric helps teams turn review rules into local-first checks for Claude, Codex,
Copilot, Cursor, and human PR authors.

The npm package is `@rubric-dev/cli`; it installs the `rubric` binary.

## Quickstart

```bash
npx @rubric-dev/cli doctor
npx @rubric-dev/cli init
npx @rubric-dev/cli compile
npx @rubric-dev/cli check --base main
```

After installation, use the `rubric` binary directly:

```bash
rubric demo
rubric doctor
rubric check --base main
```

## Commands

Implemented:

| Command           | What it does                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------ |
| `rubric demo`     | Shows a zero-setup sample preflight report                                                 |
| `rubric doctor`   | Checks whether a repo is AI-agent ready                                                    |
| `rubric init`     | Creates starter Rubric config, rules, workflow, and PR template                            |
| `rubric add-pack` | Adds built-in rule packs                                                                   |
| `rubric compile`  | Generates AGENTS.md, CLAUDE.md, Copilot instructions, Cursor rules, and PR template blocks |
| `rubric check`    | Checks the current diff against Rubric rules                                               |

## Privacy

Core commands are local-first.

- No GitHub token required for `demo`, `doctor`, `init`, `add-pack`, `compile`,
  or `check`
- No LLM API key required
- No telemetry by default
- No code is sent to external services by core commands

## Principles

- Team review memory, not AI code detection
- Deterministic checks for predictable review feedback
- No employee scoring or surveillance features
- Semantic or LLM-assisted findings should default to warnings

## Not yet

Planned:

- GitHub PR history mining
- evidence-linked rule proposals
- optional LLM-assisted extraction
- GitHub Action comment mode

## Quick local usage

```bash
npx @rubric-dev/cli demo
npx @rubric-dev/cli doctor
npx @rubric-dev/cli init
npx @rubric-dev/cli add-pack testing migrations security
npx @rubric-dev/cli compile
npx @rubric-dev/cli check --base main
```

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
pnpm --filter @rubric-dev/cli dev -- demo
```
