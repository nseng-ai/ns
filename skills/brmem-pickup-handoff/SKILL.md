---
name: brmem-pickup-handoff
description: "Pick up, resume, or continue from a Branch Memory handoff artifact. Use when the user says pick up handoff, pickup handoff, resume handoff, continue from handoff, or asks to load a stored branch/session handoff from brmem."
allowed-tools:
  - "Bash(git branch *)"
  - "Bash(brmem *)"
---

# brmem-pickup-handoff

Use this skill to resume work from a concise Markdown handoff artifact stored in
Branch Memory for the relevant branch. This is the read-side complement to
`brmem-handoff`.

## Storage contract

- Namespace: `session-artifacts`
- Entry key shape: `handoffs/<semantic-slug>.md`

The semantic slug is the chooser metadata. Do not expect a separate index,
summary entry, or machine-readable manifest.

## Choose the branch

1. If the user names a branch, use it explicitly with `--branch <branch>`.
2. Otherwise use the current branch:

```bash
git branch --show-current
```

Stop if the repo is in detached HEAD.

## Discover candidate handoffs

List stored session artifacts:

```bash
brmem list --namespace session-artifacts --branch <branch> --format json
```

Filter the returned entries to keys matching `handoffs/*.md`.

If no handoffs exist on the branch, say so and include the branch and namespace
that were checked.

## Select the handoff

Prefer selection by explicit identity before inference:

1. If the user provides an exact Entry Key like `handoffs/foo.md`, load it.
2. If the user provides a slug like `foo`, normalize it to `handoffs/foo.md` and
   load it when present.
3. If exactly one handoff exists, load it.
4. If the user provided search words, match them against the semantic slug:
   - split the slug on `-`, `_`, `/`, and `.`
   - ignore the `handoffs/` prefix and `.md` suffix
   - prefer slugs containing all requested terms
   - if exactly one candidate clearly matches, load it
5. If several candidates remain plausible, ask the user to choose. Print only
   the branch and candidate slugs; do not read every artifact just to summarize
   it.

Example ambiguity prompt:

```text
Found multiple handoffs on <branch>:

1. handoffs/address-review-feedback.md
2. handoffs/add-pickup-handoff-skill.md
3. handoffs/refactor-brmem-cli-docs.md

Which handoff should I pick up?
```

## Read and resume

Read the selected artifact:

```bash
brmem get handoffs/<semantic-slug>.md --namespace session-artifacts --branch <branch>
```

Treat the handoff content as active context for the session. Summarize what was
loaded briefly, then continue with the concrete next steps in the artifact.

Report:

- Branch
- Namespace: `session-artifacts`
- Entry: `handoffs/<semantic-slug>.md`
- The immediate next step you will take, if the artifact identifies one

## If the artifact is stale or incomplete

If the handoff references missing files, obsolete commands, or completed work,
verify current repository state before acting. Tell the user what no longer
matches and proceed from the present state rather than blindly following stale
instructions.
