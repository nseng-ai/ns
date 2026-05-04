---
name: objective-claim
description: "Command: objective-claim"
allowed-tools:
  - "Bash(objective exec claim *)"
  - "Read"
---

# objective-claim

Carry-forward primitive for attaching an existing objective snapshot to a
target branch.

> For shared concepts — vocabulary, storage model, content anatomy, lifecycle,
> carry-forward semantics, and mutation contracts — see
> `../objective/SKILL.md` and
> `../objective/references/mutation-contract.md`.

## Goal

Given an optional objective slug, copy one existing objective snapshot
verbatim onto the target branch. Claim never edits, merges, summarizes, or
implements objective content; reshaping belongs to `objective-update` on a
branch snapshot or `objective-reconcile` into canonical state.

Other skills that need to attach a missing snapshot should delegate here
instead of reproducing claim mechanics.

## Inputs

- **Slug, optional.** Pass it positionally when the user supplied one.
- **Target, optional.** `--target <branch>` overrides the write destination;
  otherwise the CLI uses the current branch.
- **Source, optional.** `--from <branch>` uses an explicit source branch.
  `--from-file <path>` treats a local file as `<slug>/body.md`. Both require
  an explicit slug and are mutually exclusive.

## Workflow

Run the high-level command with the user's arguments:

```bash
objective exec claim [slug] [--target <branch>] [--from <branch>] \
  [--from-file <path>] --format json
```

The Clinkr JSON envelope wraps `data`. Use `data.status`:

- `"claimed"` — report `data.message` to the user.
- `"needs_selection"` — surface `data.message` or
  `data.selection.options[]`. Do not auto-pick. After the user chooses an
  option, re-run `objective exec claim` with that option's complete
  `rerun_args` plus `--format json`.
- `"blocked"` — report `data.message`; the user must change inputs or
  create/update objective state before retrying.

If the command exits non-zero, surface the Clinkr error message. Non-zero
exits are hard precondition or drift failures, not states to repair inside
this skill.

## Output

For successful claims, the CLI's `data.message` already includes the slug,
source, target branch, files carried, destination ref, commit SHA, and next
step hint. Report it directly; do not reconstruct it from lower-level fields.

## Guardrails

- Never choose among `needs_selection` options without user intent.
- Never run `claim-plan` / `claim-apply` directly unless debugging the CLI;
  `objective exec claim` is the skill-facing contract.
- Never synthesize objective files, carry only part of a branch snapshot,
  write canonical objective storage, run update/reconcile, or implement work
  during claim. The CLI enforces these semantics.
