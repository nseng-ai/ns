---
name: brmem-pickup-handoff
description: "Load a saved handoff artifact and resume focused work. Use when the user says load handoff, pick up handoff, resume handoff, continue from handoff, or asks to read a stored handoff; use brmem only as storage/recovery machinery."
allowed-tools:
  - "Bash(git branch *)"
  - "Bash(brmem *)"
---

# Load a handoff

Use this skill to load a saved Markdown handoff artifact and resume the future-continuation focus captured in it. A handoff is directed saved work context; it is not in-session compaction and not a generic session summary.

Normal user language is load/resume from a handoff. Branch Memory is the storage command behind this skill; mention namespace, key, ref, or commit only as technical locator evidence, recovery detail, or error context.

## Storage contract

- Namespace: `session-artifacts`
- Entry key shape: `handoffs/<semantic-slug>.md`

The semantic slug is the chooser metadata. Do not expect a separate index, summary entry, or machine-readable manifest.

## Choose the branch

1. If the user names a branch, use it explicitly with `--branch <branch>`.
2. Otherwise use the current branch:

```bash
git branch --show-current
```

Stop if the repo is in detached HEAD.

## Discover candidate handoffs

List stored handoff artifacts:

```bash
brmem list --namespace session-artifacts --branch <branch> --format json
```

Filter the returned entries to keys matching `handoffs/*.md`.

If no handoffs exist on the branch, say so in public vocabulary:

```text
No saved handoffs found on branch `<branch>`.
```

Include namespace/key details only if the user needs technical recovery context.

## Select the handoff

Prefer selection by explicit identity before inference:

1. If the user provides an exact entry key like `handoffs/foo.md`, load it.
2. If the user provides a slug like `foo`, normalize it to `handoffs/foo.md` and load it when present.
3. If exactly one handoff exists, load it.
4. If the user provided search words, match them against the semantic slug:
   - split the slug on `-`, `_`, `/`, and `.`
   - ignore the `handoffs/` prefix and `.md` suffix
   - prefer slugs containing all requested terms
   - if exactly one candidate clearly matches, load it
5. If several candidates remain plausible, ask the user to choose. Print branch and candidate slugs; do not read every artifact just to summarize it.

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
brmem get handoffs/<semantic-slug>.md --namespace session-artifacts --branch <branch>
```

Treat the handoff content as active context for the session. Briefly summarize what was loaded, then continue with the concrete next step in the artifact.

Report in handoff vocabulary first:

- Branch
- Handoff slug
- The immediate next step you will take, if the artifact identifies one

Include a compact technical locator when useful:

- Namespace: `session-artifacts`
- Entry: `handoffs/<semantic-slug>.md`

## If the artifact is stale or incomplete

If the handoff references missing files, obsolete commands, or completed work, verify current repository state before acting. Tell the user what no longer matches and proceed from the present state rather than blindly following stale instructions.
