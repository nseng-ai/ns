---
name: ns-flow-submit
disable-model-invocation: true
description: "Submit or update the current Graphite stack by delegating to `ns flow submit`."
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

Ordinary `ns flow submit` generates initial titles and ns-managed descriptions only for PRs newly created by that invocation. It never edits the title or body of a PR that existed before the invocation, even when the body is empty or its managed fingerprint is missing, malformed, stale, or unchanged.

To explicitly regenerate titles and managed descriptions for every PR in the submitted stack scope, including existing PRs with non-empty bodies or matching fingerprints, run:

```bash
ns flow submit --regenerate-descriptions
```

To regenerate only the current branch PR explicitly, run:

```bash
ns flow regenerate-pr
```

Both explicit regeneration paths keep title and managed-body updates coupled and preserve human-authored text outside the managed region. `ns flow regenerate-pr` asks before editing GitHub.

## Failure handling

Surface CLI output directly, including any `AI interpretation` section. Do not bypass the checkpoint failure, Graphite submit failure, or post-submit PR verification failure. Do not fall back to raw `gt submit` unless the user explicitly asks for a manual fallback after seeing the CLI failure.

## Boundaries

- It does not land/merge PRs.
- Ordinary submit edits titles/bodies only for PRs it creates; existing PR prose requires `--regenerate-descriptions` or explicit `ns flow regenerate-pr`.
