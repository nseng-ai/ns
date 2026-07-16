---
name: dispatch-plan
disable-model-invocation: true
description: Dispatch one explicit Saved Plan through the Vercel-native cloud dispatch spine by delegating to `ns dispatch plan`.
allowed-tools:
  - "Bash(ns dispatch plan *)"
---

# dispatch-plan

Dispatch one explicit Saved Plan by delegating to the kernel command:

```bash
ns dispatch plan <absolute-or-home-plan-file.md>
```

## Input

The plan reference is required. Resolve or ask for the exact Saved Plan path before invoking the command; do not infer a latest plan from files, Branch Context, branch metadata, or another session. Latest-current-session selection is Pi-only sugar provided by `/ns:dispatch:plan`.

## Contract

The kernel resolves the Saved Plan, creates the Dispatch ID, delivers a dispatch-owned copy through Branch Memory, verifies its exact remote Snapshot Ref, creates the anchor branch and pull request, and starts the configured Vercel Workflow. Do not read or transport the plan body yourself, run `brmem put`, push refs, open a PR, or trigger a workflow outside the command.

Report the human output directly. For automation or recovery details, rerun the same explicit command with `--format json`; its machine result carries the Dispatch ID, full Branch Memory context locator, anchor PR, and workflow run provenance.

## Failure handling

Preserve the command's failure output. In particular, surface `brmem setup-git` guidance and every reported durable artifact from partial delivery. Never guess that a run started, retry with a different plan, overwrite Branch Memory input, or perform manual transport recovery without explicit user direction.
