---
name: handoff-pickup
disable-model-invocation: true
description: "Pick up, choose, or list handoff artifacts, present a handoff summary, and wait for user direction. Use when the user says pick up handoff, resume handoff, continue from handoff, choose a handoff, or list handoffs."
allowed-tools:
  - "Bash(git branch *)"
  - "Bash(ns handoff *)"
  - "Bash(brmem *)"
---

# handoff-pickup

Pick up, choose, or list Markdown handoff artifacts, present the selected handoff's summary, and wait for user direction before continuing work. This is the pickup/list/review step in the `handoff` skill family; load the `handoff` umbrella for shared terminology, lifecycle, storage contract, diagnostics, cleanup, and admin flows. Treat resume-from wording as pickup intent, not a separate lifecycle action.

## Storage contract

- Namespace: `handoff`
- Entry key shape: flat `<semantic-slug>.md`; do not accept `/`-containing selectors in the normal handoff UX

The semantic slug is the chooser metadata. Do not expect a separate index, summary entry, or machine-readable manifest.

## Choose the branch scope

For current-branch pickup or list:

1. If the user names a branch, use it explicitly with `--branch <branch>`.
2. Otherwise use the current branch:

```bash
git branch --show-current
```

Stop if the repo is in detached HEAD and the user did not provide a branch. If the user asks to discover handoffs across branches, use all-branch listing instead.

## List handoffs

Current branch:

```bash
ns handoff list --format json
```

Explicit branch:

```bash
ns handoff list --branch <branch> --format json
```

All active local branches:

```bash
ns handoff list --all --format json
```

All branch states, including deleted local branches:

```bash
ns handoff list --all --include-deleted --format json
```

Use `--include-deleted` for recovery, cleanup, or when the user explicitly asks for deleted or stale branch handoffs.

- The JSON payload's `data.handoffs` list contains handoff records with `branch`, `branchState`, `slug`, `key`, `entryLocator`, and `updatedAt`; `data.includeDeleted` records whether deleted local branches were included.
- Show normal results as handoff choices grouped by branch when listing across branches, including branch state.
- Call out `deleted` branches when relevant because those handoffs may be cleanup candidates.
- For each choice, show the slug, recency or a short continuation focus/preview when available, and a copyable pickup command such as `/ns:handoff:pickup <slug>` or `/ns:handoff:pickup --branch <branch> <slug>` when speaking to a Pi user.
- Avoid exposing raw storage keys unless the user needs technical recovery detail.

If no handoffs exist, report that none were found, naming the scope searched, in handoff vocabulary.

For delete or cleanup, load the `handoff` umbrella.

## Select the handoff

Resolve the user's selector (exact key, slug, or free-text search words) deterministically through the command face instead of matching by hand:

```bash
ns handoff exec match [--branch <branch>|--all] [--include-deleted] [selector words...] --format json
```

The command applies the handoff selection ladder in order: exact key, slug normalized to `<slug>.md`, the only handoff in scope when the selector is empty, then term matching (selector words matched against the slug's words split on `-`/`_`/`.`, ignoring the `.md` suffix; only slugs containing all terms match). Interpret `data.resolution`:

- `unique`: pick up `data.selected.slug` on `data.selected.branch`.
- `ambiguous`: ask the user to choose from `data.candidates`. Print branch and candidate slugs; do not require the user to know storage keys.
- `none`: report that nothing matched the selector, naming the scope searched. `data.candidates` is empty for this resolution, so run `ns handoff list` for the same scope and offer those handoffs as choices. Note that a non-empty selector never auto-selects: even when exactly one handoff exists in scope, selector words that do not match it resolve to `none` rather than picking it up.

## Read and present summary

Read the selected artifact through the portable command face:

```bash
ns handoff pickup <semantic-slug> --branch <branch> --format json
```

Use the JSON envelope's `data.content` as active context for summarization, with `data.branch`, `data.slug`, `data.key`, `data.entryLocator`, and `data.summary` as technical evidence. Present a concise handoff summary, then stop and wait for the user's explicit instruction before running commands, editing files, or continuing implementation. Use raw `brmem get <semantic-slug>.md --namespace handoff --branch <branch>` only for storage diagnostics/recovery.

Report in handoff vocabulary first:

- Branch
- Handoff slug picked up
- Continuation focus or current state, if the artifact identifies one
- Proposed immediate next step(s) from the artifact, phrased as proposed work rather than work you will now take
- Risks, stale assumptions, missing context, or verification needed before continuing
- Source session ID, source session log, and related investigation file paths recorded in the artifact, without reading those sources automatically

Include a compact technical locator when useful:

- Namespace: `handoff`
- Entry: `<semantic-slug>.md`

End with a short handoff-control question such as: `How would you like me to proceed?`

## If the artifact is stale or incomplete

If the handoff references missing files, obsolete commands, or completed work, call that out in the summary when evident from the artifact or already-known context. Do not automatically inspect, verify, or mutate the repository after pickup unless the user asks. If verification is needed, list it as a recommended next step and wait.

For copy, move, delete, garbage collection, or other administrative repair flows, load the `handoff` umbrella's diagnostics/admin reference instead of improvising broad Branch Memory operations.
