---
name: objective-claim
description: "Command: objective-claim"
allowed-tools:
  - "Bash(objective exec claim-plan *)"
  - "Bash(objective exec claim-apply *)"
  - "Read"
  - "Write"
---

# objective-claim

Carry-forward primitive for attaching an objective snapshot to a target
branch.

> For shared concepts — vocabulary, storage model, content anatomy, lifecycle,
> carry-forward semantics, and mutation contracts — see
> `../objective/SKILL.md` and
> `../objective/references/mutation-contract.md`.

## Goal

Given an objective slug — supplied directly or resolved from the nearest
ancestor branch's claimed objectives — resolve one source and copy it
verbatim to the target branch snapshot.

`claim` only attaches existing workstream state. It never edits, merges, or
summarizes objective content; reshaping belongs to `objective-update`
on branch snapshots or `objective-reconcile` into canonical state.

## Inputs

- **Slug, optional.** Parse the objective slug from the prompt when present.
  When the prompt lacks a slug, `claim-plan` walks the nearest live ancestor
  that carries any objectives and either returns a unique plan or surfaces
  the candidate set as a structured ambiguity for the user to resolve.
- **Target, optional.** `--target <branch>` overrides the write destination.
  Otherwise `claim-plan` defaults to the current branch.
- **Source, optional.** `--from <branch>` uses an explicit source branch.
  `--from-file <path>` treats a local file as `<slug>/body.md`. These flags
  are mutually exclusive, both require an explicit slug, and `claim-plan`
  fails hard when either is supplied without a slug.

## Workflow

### 1. Plan the claim

Run `claim-plan` with whatever the user supplied:

```bash
objective exec claim-plan [slug] [--target <branch>] [--from <branch>] \
  [--from-file <path>] --format json
```

The CLI:

- Validates hard preconditions (in a git repo, target ≠ `master`, no
  detached `HEAD` without `--target`, `--from` and `--from-file` not
  together, `--from`/`--from-file` not without an explicit slug). These
  surface as exit-2 failures.
- Resolves the target branch.
- When no slug is supplied, walks brmem ancestor branches nearest-first and
  uses the slug set on the **nearest** ancestor (or canonical `master` when
  no ancestor carries objectives).
- Runs the source cascade for the resolved slug: `--from-file` →
  `--from <branch>` → nearest live ancestor branch carrying
  `<slug>/body.md` → canonical `master`.
- Checks whether the target already carries any key under `<slug>/`.

The JSON envelope's top-level `status` is one of:

- `"plan"` — `plan` is populated with the unique deterministic plan.
- `"ambiguous"` — `ambiguity` is populated. Reason codes:
  - `ambiguous_slug_candidates` — multiple slugs reachable; surface the
    `slug_alternatives` list to the user and re-run with an explicit slug.
  - `ambiguous_source_branches` — multiple ancestor branches tie for
    nearest; surface the `branch_alternatives` list and re-run with
    `--from <branch>`.
  - `no_slug_no_candidates` — nothing reachable anywhere; tell the user to
    pass `--from-file` or run `objective-create`.
- `"error"` — `error` is populated. Reason codes include
  `target_collision`, `explicit_slug_not_found`, `from_missing_slug`, and
  `from_file_unreadable`. Surface the message; the user resolves the
  underlying issue before re-running `claim-plan`.

### 2. Apply the plan

When status is `"plan"`, persist the envelope and run apply:

```bash
PLAN=/tmp/objective-claim-plan-<slug>.json
objective exec claim-apply --plan-file "$PLAN" --format json
```

`claim-apply`:

- Re-validates the plan (target still empty for the slug, source still
  carries `<slug>/body.md`, local file still readable) and fails hard if
  drift has happened since plan time.
- For branch sources, runs `brmem copy --key-glob '<slug>/*'` and carries
  every file under `<slug>/` verbatim.
- For local-file sources, runs `brmem put` for `<slug>/body.md` only.
- Returns the destination ref, commit SHA, and the actual files carried.

### 3. Final Output

Render from the apply JSON:

- objective slug
- source label (`source_label`)
- target branch (`target_branch`)
- files carried (`files_carried[]`)
- destination ref (`destination_ref`)
- commit SHA (`destination_commit_sha`)
- next-step hint:

```text
This branch is ready for implementation. After implementing the slice, merge
the PR and run objective-reconcile <slug> on master. Run
objective-update <slug> only if another branch will claim from this
branch before it lands.
```

## Edge Cases And Anti-Patterns

- Detached `HEAD` without `--target`, `--from` or `--from-file` without a
  slug, `--from` plus `--from-file`, or `--target master`: `claim-plan`
  fails hard (exit 2). The master-target guard exists because claim
  attaches canonical objectives to feature branches; master is the
  canonical store.
- No-slug invocation with no candidates anywhere: surface the
  `no_slug_no_candidates` ambiguity and tell the user to pass `--from-file`
  or run `objective-create`.
- Target already carries `<slug>/`: `claim-plan` surfaces a
  `target_collision` error. `claim-apply` re-checks this immediately
  before mutating and fails the same way if the state has drifted.
- Explicit source lacks `<slug>/body.md`: `claim-plan` returns a
  `from_missing_slug` error; do not fall back to discovery.
- Source no longer carries `<slug>/body.md` between plan and apply (e.g.
  the snapshot was deleted): `claim-apply` fails with
  `source_missing_slug`.
- Multiple nearest ancestor candidates at the same distance: `claim-plan`
  returns an `ambiguous_source_branches` ambiguity. Re-run with
  `--from <branch>` once the user picks.
- Slug exists only in canonical storage: `claim-plan` selects the
  canonical objective.
- Slug exists nowhere: `claim-plan` returns `explicit_slug_not_found`. Ask
  the user for an explicit source or create the objective first.
- Never auto-pick a slug from a branch name, fuse multiple snapshots,
  carry only `body.md` from a branch source, synthesize sibling files from
  `--from-file`, write to canonical storage, run `update`, or implement
  work during `claim`. The CLI enforces all of these.
