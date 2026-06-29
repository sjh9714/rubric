# Rubric

Your team keeps leaving the same PR comments.

Rubric turns repeated PR feedback into repo rules that humans, coding agents,
and CI can run before review.

```bash
npx --yes @rubric-dev/cli demo
```

The npm package is `@rubric-dev/cli`; it installs the `rubric` binary.

Team review memory for AI-assisted development.

It is not an AI code detector.
It is not another linter.
It is a way to keep your team's review standards from disappearing
as more code is written by agents.

## The problem

Team review memory usually lives in repeated comments:

- "API changes need tests."
- "Destructive migrations need rollback notes."
- "Please list verification commands."
- "This PR is too broad."

With AI coding agents, these repeated misses happen faster.

Rubric lets you turn those comments into rules, commit them to the repo, and
share them with Claude, Codex, Copilot, Cursor, CI, and human authors.

## Before Rubric

```text
Reviewer: "API changes need tests."
Reviewer: "Please document the rollback plan."
Reviewer: "What commands did you run?"
```

## After Rubric

```bash
rubric check --base main
```

Rubric catches repeated feedback before review and compiles the same rules into:

- AGENTS.md
- CLAUDE.md
- GitHub Copilot instructions
- Cursor rules
- PR templates
- GitHub Actions

## From comment to check

```bash
rubric propose --from-text "API changes need tests" --write
rubric compile
rubric check --base main
```

That flow drafts `.rubric/rules/proposed.api-changes-need-tests.yaml`,
publishes the rule into configured agent instructions, and checks the next diff
before review.

## How Rubric works

Rubric keeps review expectations in `.rubric/rules` so the same standards can
show up before review:

- A repeated review comment becomes a YAML rule.
- `rubric compile` publishes those rules into agent and PR instructions.
- `rubric check` evaluates the current diff before review.
- GitHub Action comment mode can deliver the same report as a sticky PR comment.

The sticky comment is delivery. The product is the review memory your team keeps
in the repo.

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

## Team workflow

1. Pick a few recent PRs.
2. Find the review comments your team keeps repeating.
3. Convert the top rules into `.rubric/rules`.
4. Run `rubric compile` so agents and humans see the same standards.
5. Run `rubric check` before opening the next PR.
6. Review which rules fired in your next team retro.

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

| Command           | What it does                                                     |
| ----------------- | ---------------------------------------------------------------- |
| `rubric demo`     | Shows a zero-setup sample preflight report.                      |
| `rubric doctor`   | Checks whether a repo is AI-agent ready.                         |
| `rubric init`     | Creates starter Rubric config, rules, workflow, and PR template. |
| `rubric add-pack` | Adds built-in rule packs.                                        |
| `rubric propose`  | Drafts a rule from repeated review feedback text.                |
| `rubric compile`  | Generates agent instruction files and PR template blocks.        |
| `rubric check`    | Checks the current diff against Rubric rules.                    |

Draft a local rule from one repeated review comment:

```bash
rubric propose --from-text "API changes need tests"
```

Local proposals preserve the source comment as `evidence.quote`.
Historical GitHub PR review mining is planned, not implemented yet.

GitHub Action comment mode is implemented as an opt-in delivery path. The
easiest setup path is:

```bash
rubric init --github-comment
```

The generated workflow uses:

```yaml
permissions:
  contents: read
  pull-requests: write
  issues: write

steps:
  - uses: actions/checkout@v6
    with:
      fetch-depth: 0

  - uses: sjh9714/rubric/packages/action@v0.3.1
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

- GitHub PR history mining (#15).
- Evidence-linked rule proposals with history links and `.rubric/evidence`
  storage (#14).
- Optional LLM-assisted extraction.

## Quick local usage

```bash
npx @rubric-dev/cli demo
npx @rubric-dev/cli doctor
npx @rubric-dev/cli init
npx @rubric-dev/cli add-pack testing migrations security
npx @rubric-dev/cli propose --from-text "API changes need tests"
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
