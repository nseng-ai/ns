---
name: ns-flow-submit
disable-model-invocation: true
description: "Command: ns-flow-submit"
allowed-tools:
  - "Bash(ns flow submit*)"
metadata:
  internal: true
---

# ns-flow-submit

Submit or update the current Graphite stack by delegating to the `ns flow submit` CLI. This is the cross-harness path for `/ns:flow:submit`; do not run a parallel hand-written `gt submit` sequence unless the CLI is unavailable and the user explicitly accepts the fallback.

## When to use

Use only when the user explicitly asks to submit or update the current Graphite stack/PRs. This performs write-capable external effects through Graphite/GitHub.

## Workflow

Run from the repository root:

```bash
ns flow submit
```

The CLI owns the orchestration:

- if the worktree is dirty, first creates a checkpoint with `ns flow cp`;
- checks submit readiness with `gt submit -nps --no-ai --no-interactive --dry-run`;
- runs `gt submit -nps --no-ai --no-interactive` to submit/update the current stack;
- verifies that the current branch has a PR after submit.

If the CLI says a restack is required:

- in an interactive session, follow the CLI prompt;
- in a non-interactive/headless invocation, rerun only with explicit user approval:

```bash
ns flow submit --restack
```

To regenerate the current branch PR explicitly, run:

```bash
ns flow regenerate-pr
```

`ns flow submit` preserves unchanged generated descriptions by comparing the GitHub PR diff patch id, prompt hash, and generator version stored in the managed body region. Explicit `ns flow regenerate-pr` asks before editing GitHub, always regenerates the current branch PR title and managed generated body region, and preserves human-authored body text outside that region.

## Failure handling

Surface CLI output directly, including any `AI interpretation` section. Do not bypass the checkpoint failure, Graphite submit failure, or post-submit PR verification failure. Do not fall back to raw `gt submit` unless the user explicitly asks for a manual fallback after seeing the CLI failure.

## Boundaries

- It does not land/merge PRs.
- It edits PR titles/bodies through `ns flow submit` or explicit `ns flow regenerate-pr`.
