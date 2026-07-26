---
name: ns-flow-submit
disable-model-invocation: true
description: "Submit or update the current Graphite stack by delegating to `ns flow submit`."
allowed-tools:
  - "Bash(ns flow submit*)"
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

The CLI owns checkpointing, readiness/restack, Graphite submission, exact-scope post-submit PR inventory, and metadata for newly created PRs.

If the CLI says a restack is required:

- in an interactive session, follow the CLI prompt;
- in a non-interactive/headless invocation, rerun only with explicit user approval:

```bash
ns flow submit --restack
```

Ordinary submit leaves every PR that existed before the invocation untouched. After Graphite publishes, Flow re-queries GitHub for exactly the planned branches and uses those authoritative branch-keyed PR identities—not URLs parsed from Graphite output—to select newly created PRs. It prepares complete generated title/body replacements for all selected PRs before any GitHub edit, then applies replacements sequentially. A preparation failure edits none; an edit failure stops and reports applied, failed, and not-attempted PRs.

If any planned branch has no open PR, multiple open PRs, malformed lookup data, a query failure, or a changed pre-existing identity, submit fails after publication but before metadata generation and edits no PR metadata. Repair the PR/head-branch association and rerun `ns flow submit`; because the retry treats now-existing PRs as untouched, use `ns flow regenerate-pr` on any branch whose initial metadata was skipped.

To widen that batch to every PR resolved in the submitted scope — existing and new — run:

```bash
ns flow submit --regenerate-descriptions
```

This replaces the complete title and body of every selected PR and removes all existing body content, including human-authored prose; there is no managed-region merging and no rollback. It requires a TTY confirmation, or `--yes`/`-y` for explicit non-interactive approval. The same prepare-all-before-edit and sequential-application failure behavior applies.

To replace the complete title and body of only an existing current-branch PR, run:

```bash
ns flow regenerate-pr
```

That focused command confirms by default and accepts `--yes` for explicit non-interactive approval. Generated bodies carry visible command, prompt-source, and model provenance.

## Failure handling

Surface CLI output directly, including any `AI interpretation` section and partial metadata-application report. Do not bypass checkpoint, Graphite submit, post-submit verification, or metadata failures. Do not fall back to raw `gt submit` unless the user explicitly asks after seeing the CLI failure.

## Boundaries

- It does not land/merge PRs.
- Ordinary submit edits titles/bodies only for PRs it creates.
- Stack-wide regeneration of existing PR metadata happens only under explicit `--regenerate-descriptions` authorization; never pass `--yes` on the user's behalf without their explicit approval.
