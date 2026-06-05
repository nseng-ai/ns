---
name: handoff-load
description: "Pick up, choose, or list saved handoff artifacts and resume focused work. Use when the user says pick up handoff, load handoff, resume handoff, continue from handoff, choose a handoff, or list saved handoffs; use brmem only as storage/recovery machinery."
allowed-tools:
  - "Bash(git branch *)"
  - "Bash(handoff *)"
  - "Bash(brmem *)"
---

# handoff-load

Use this skill to pick up, choose, or list saved Markdown handoff artifacts and resume the future-continuation focus captured in one. A handoff is directed saved work context; it is not in-session compaction and not a generic session summary.

This is the load/list/resume step in the `handoff` skill family. Use the `handoff` umbrella for shared terminology, lifecycle, storage contract, diagnostics, cleanup, and branch-to-branch admin flows; keep this skill focused on selecting and reading artifacts.

Normal user language is pick up/list/resume from a handoff. Branch Memory is the storage command behind this skill; mention namespace, key, ref, or commit only as technical locator evidence, recovery detail, or error context.

## Storage contract

- Namespace: `handoffs`
- Entry key shape: `<semantic-slug>.md`

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
handoff list --format json
```

Explicit branch:

```bash
handoff list --branch <branch> --format json
```

All active local branches:

```bash
handoff list --all --format json
```

All branch states, including deleted local branches:

```bash
handoff list --all --include-deleted --format json
```

Use `--include-deleted` for recovery, cleanup, or when the user explicitly asks for deleted or stale branch handoffs.

The JSON payload's `data.handoffs` list contains handoff records with `branch`, `branch_state`, `slug`, `key`, `entry_locator`, and `updated_at`; `data.include_deleted` records whether deleted local branches were included. Show normal results as handoff choices grouped by branch when listing across branches, including branch state. Call out `deleted` branches when relevant because those handoffs may be cleanup candidates. For each choice, show the slug, recency or a short continuation focus/preview when available, and a copyable pickup command such as `/handoff:pickup <slug>` or `/handoff:pickup --branch <branch> <slug>` when speaking to a Pi user. Avoid exposing raw storage keys unless the user needs technical recovery detail.

If no handoffs exist, say so in public vocabulary:

```text
No saved handoffs found on branch `<branch>`.
```

or:

```text
No saved handoffs found across active branches.
```

or, when using `--include-deleted`:

```text
No saved handoffs found across branches.
```

For explicit removal of one stale or unneeded handoff, use `handoff delete [--branch <branch>] <slug>` with the user-facing slug (no `.md`). Use `handoff gc` for bulk cleanup of handoffs on deleted local branches. Use raw `brmem delete` only for storage diagnostics/recovery.

## Select the handoff

Prefer selection by explicit identity before inference:

1. If the user provides an exact key like `foo.md`, pick it up.
2. If the user provides a slug like `foo`, normalize it to `foo.md` and pick it up when present.
3. If exactly one handoff exists in the selected branch scope, pick it up.
4. If the user provided search words, match them against the semantic slug:
   - split the slug on `-`, `_`, and `.`
   - ignore the `.md` suffix
   - prefer slugs containing all requested terms
   - if exactly one candidate clearly matches, pick it up
5. If several candidates remain plausible, ask the user to choose. Print branch and candidate slugs; do not require the user to know storage keys.

Do not accept `/`-containing handoff selectors for the normal handoff UX. Flat `<semantic-slug>.md` keys are the handoff contract.

Example ambiguity prompt:

```text
Found multiple handoffs on <branch>:

1. address-review-feedback
2. add-pickup-handoff-command
3. refactor-brmem-cli-docs

Which handoff should I pick up?
```

## Read and resume

Read the selected artifact:

```bash
brmem get <semantic-slug>.md --namespace handoffs --branch <branch>
```

Treat the handoff content as active context for the session. Briefly summarize what was picked up, then continue with the concrete next step in the artifact.

Report in handoff vocabulary first:

- Branch
- Handoff slug picked up
- The immediate next step you will take, if the artifact identifies one

Include a compact technical locator when useful:

- Namespace: `handoffs`
- Entry: `<semantic-slug>.md`

## If the artifact is stale or incomplete

If the handoff references missing files, obsolete commands, or completed work, verify current repository state before acting. Tell the user what no longer matches and proceed from the present state rather than blindly following stale instructions.

For copy, move, delete, garbage collection, or other administrative repair flows, load the `handoff` umbrella's diagnostics/admin reference instead of improvising broad Branch Memory operations.
