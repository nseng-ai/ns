---
name: handoff-load
description: "Load, choose, or list saved handoff artifacts and resume focused work. Use when the user says load handoff, pick up handoff, resume handoff, continue from handoff, choose a handoff, or list saved handoffs; use brmem only as storage/recovery machinery."
allowed-tools:
  - "Bash(git branch *)"
  - "Bash(brmem *)"
---

# handoff-load

Use this skill to load, choose, or list saved Markdown handoff artifacts and resume the future-continuation focus captured in one. A handoff is directed saved work context; it is not in-session compaction and not a generic session summary.

Normal user language is load/list/resume from a handoff. Branch Memory is the storage command behind this skill; mention namespace, key, ref, or commit only as technical locator evidence, recovery detail, or error context.

## Storage contract

- Namespace: `handoffs`
- Entry key shape: `<semantic-slug>.md`

The semantic slug is the chooser metadata. Do not expect a separate index, summary entry, or machine-readable manifest.

## Choose the branch scope

For current-branch load or list:

1. If the user names a branch, use it explicitly with `--branch <branch>`.
2. Otherwise use the current branch:

```bash
git branch --show-current
```

Stop if the repo is in detached HEAD and the user did not provide a branch. If the user asks to discover handoffs across branches, use all-branches listing instead.

## List handoffs

Current branch or explicit branch:

```bash
brmem list --namespace handoffs --branch <branch> --format json
```

All branches:

```bash
brmem list --namespace handoffs --all-branches --format json
```

Show normal results as handoff choices: branch when listing across branches, slug, and a short continuation focus or preview when available. Avoid exposing raw storage keys unless the user needs technical recovery detail.

If no handoffs exist, say so in public vocabulary:

```text
No saved handoffs found on branch `<branch>`.
```

or:

```text
No saved handoffs found across branches.
```

## Select the handoff

Prefer selection by explicit identity before inference:

1. If the user provides an exact key like `foo.md`, load it.
2. If the user provides a slug like `foo`, normalize it to `foo.md` and load it when present.
3. If exactly one handoff exists in the selected branch scope, load it.
4. If the user provided search words, match them against the semantic slug:
   - split the slug on `-`, `_`, and `.`
   - ignore the `.md` suffix
   - prefer slugs containing all requested terms
   - if exactly one candidate clearly matches, load it
5. If several candidates remain plausible, ask the user to choose. Print branch and candidate slugs; do not require the user to know storage keys.

Do not accept `/`-containing handoff selectors for the normal handoff UX. Flat `<semantic-slug>.md` keys are the handoff contract.

Example ambiguity prompt:

```text
Found multiple handoffs on <branch>:

1. address-review-feedback
2. add-load-handoff-command
3. refactor-brmem-cli-docs

Which handoff should I load?
```

## Read and resume

Read the selected artifact:

```bash
brmem get <semantic-slug>.md --namespace handoffs --branch <branch>
```

Treat the handoff content as active context for the session. Briefly summarize what was loaded, then continue with the concrete next step in the artifact.

Report in handoff vocabulary first:

- Branch
- Handoff slug
- The immediate next step you will take, if the artifact identifies one

Include a compact technical locator when useful:

- Namespace: `handoffs`
- Entry: `<semantic-slug>.md`

## If the artifact is stale or incomplete

If the handoff references missing files, obsolete commands, or completed work, verify current repository state before acting. Tell the user what no longer matches and proceed from the present state rather than blindly following stale instructions.
