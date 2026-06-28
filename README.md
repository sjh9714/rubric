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

## Example output

```text
Rubric demo

Sample PR: Fix billing retry behavior

Rules checked: 5
Findings: 3

[error] testing.required-for-api-change - API changes require tests
  This PR changes API code but does not modify any test files.
  Suggestion: Add or update tests covering the changed API behavior.

[warning] db.destructive-migration-warning - Destructive database migration
  This migration appears to contain a potentially destructive database operation.

[warning] pr.too-broad - PR touches many directories
  This PR changes files across many directories.

Try it in your repo:
- rubric doctor
- rubric init
- rubric compile
- rubric check --base main
```

## What it does

- Initializes team review rules.
- Adds built-in rule packs for testing, migrations, security, and Node.
- Compiles rules into `AGENTS.md`, `CLAUDE.md`, GitHub Copilot instructions,
  Cursor rules, and PR template blocks.
- Checks PR diffs before review.
- Posts sticky GitHub Action comments when explicitly enabled.
- Runs locally without GitHub tokens or LLM API keys.

## Commands

Implemented:

| Command           | What it does                                                     |
| ----------------- | ---------------------------------------------------------------- |
| `rubric demo`     | Shows a zero-setup sample preflight report.                      |
| `rubric doctor`   | Checks whether a repo is AI-agent ready.                         |
| `rubric init`     | Creates starter Rubric config, rules, workflow, and PR template. |
| `rubric add-pack` | Adds built-in rule packs.                                        |
| `rubric compile`  | Generates agent instruction files and PR template blocks.        |
| `rubric check`    | Checks the current diff against Rubric rules.                    |

GitHub Action comment mode is implemented as an opt-in workflow:

```yaml
permissions:
  contents: read
  pull-requests: write
  issues: write

steps:
  - uses: actions/checkout@v6
    with:
      fetch-depth: 0

  - uses: sjh9714/rubric/packages/action@v0.2.0
    with:
      base: origin/${{ github.base_ref }}
      github-token: ${{ secrets.GITHUB_TOKEN }}
```

## Privacy

Core commands are local-first.

- No GitHub token required for `demo`, `doctor`, `init`, `add-pack`, `compile`,
  or `check`.
- GitHub Action comment mode uses `GITHUB_TOKEN` only to create or update the
  Rubric PR comment.
- No LLM API key required.
- No telemetry by default.
- No code is sent to external services by core commands.

## Principles

- Team review memory, not AI code detection.
- Deterministic checks for predictable review feedback.
- No employee scoring or surveillance features.
- Semantic or LLM-assisted findings should default to warnings.

## Not yet

Planned:

- GitHub PR history mining.
- Evidence-linked rule proposals.
- Optional LLM-assisted extraction.

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
