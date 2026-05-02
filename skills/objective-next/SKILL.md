---
name: objective-next
description: "Command: objective-next"
allowed-tools:
  - "Bash(objective exec next-context *)"
  - "Bash(objective exec next-collision *)"
  - "Read"
  - "Write"           # session-plan stub for ExitPlanMode
  - "ExitPlanMode"    # bounce out of plan mode before reporting
---

# objective-next

Read-only status peek and next-slice recommendation for an objective.

> For shared concepts — vocabulary, storage model, content anatomy, lifecycle,
> carry-forward semantics, and mutation contracts — see
> `../objective/SKILL.md`.

## Goal

Given an objective slug — supplied directly or resolved from the current
branch's claimed objectives — load the current-branch snapshot, summarize the
content state, surface freshness/trunk advisories, and suggest a
collision-checked kebab-case slug for the next PR-sized slice.

`next` writes nothing: no brmem mutation, no branch creation, no checkbox edits,
and no working-tree changes. It is the planning step before `objective-claim`:
choose the slice first, create a branch, then attach the objective snapshot to
that branch.

## Inputs

- **Slug, optional.** Parse the objective slug from the prompt when present.
  Otherwise let `objective exec next-context` resolve it from claims on the
  current branch. Never infer a slug from the branch name; a branch commonly
  carries a parent objective whose slug differs from the branch's slice slug.

`next` plans against the current branch only. There is no `--from`,
`--from-file`, or `--branch <other>` flag — to inspect a different branch,
check it out first.

## Core Rules

- **Read-only.** Do not mutate brmem, git refs, branches, files, checkboxes,
  or the working tree.
- **Use exec helpers for deterministic facts.** Do not run raw git or brmem for
  branch resolution, slug discovery, content loading, freshness, or collision
  checks. The only exceptions are the harness plan-mode `Write` /
  `ExitPlanMode` mechanics below.
- **Plan-mode bypass.** When invoked inside the harness's plan mode, exit plan
  mode first via the standard `ExitPlanMode` flow. This skill is read-only and
  the plan-workflow ceremony has no payoff. Details in Step 1 below.
- **Content-only.** Do not inspect repo source files to audit progress.
  Implementation evidence is folded back later by `objective-update`.
- **Current-branch-only source.** Always load the snapshot claimed on the
  current branch. There is no source cascade and no ancestor walk; if the
  current branch carries no claim, surface the helper's trunk-aware error.
- **No source cascade, no `--source` flag.** `objective-next` does not accept
  `--from`, `--from-file`, `--branch`, `--source`, or any other flag that
  would point it at a snapshot off the current branch. To inspect canonical
  state or another branch's snapshot, use `objective show <slug>` instead.
- **No Graphite dependency.** Do not use Graphite to resolve branch or stack
  facts for this skill.
- **Collision-safe suggestion.** Check the suggested slice slug against local
  branches and canonical objective slugs. On collision, warn and ask; do not
  auto-resolve.

## Workflow

### 1. Plan-mode bypass (if active)

If the current harness exposes plan mode and a writable session-plan path:

1. Use `Write` to put a one-line session-plan at the harness-provided
   session-plan path, e.g.:

   ```
   # /objective-next — read-only status peek
   Run objective-next to inspect the current branch's objective snapshot and
   suggest the next-slice slug. No mutations.
   ```

2. Call `ExitPlanMode`. The harness prompts the user for approval — this is the
   "bounce out of plan mode" prompt.
3. After approval, continue with Step 2. If the user declines, abort and tell
   the user to re-run `/objective-next` outside plan mode.

If plan mode is not active, skip this step entirely and start at Step 2.

### 2. Load deterministic context

Run:

```bash
objective exec next-context [<slug>] --format json
```

The JSON envelope supplies deterministic facts:

- current branch and trunk branch
- trunk status / empty-branch guidance
- resolved slug, or ambiguity/missing-claim details
- known files present under the objective (`body.md`, `roadmap.md`, `notes.md`)
- raw Markdown content for present files
- freshness advisory, including stale branch snapshots or marker diagnostics

If the helper exits with an error, surface its `message` and stop unless it
reports ambiguity. For ambiguity, list the candidate slugs and ask the user
which one to inspect. Do not independently probe git or brmem to resolve the
same facts.

Record the source label as `current branch <branch>` and keep the parent
objective slug visible in the final report.

### 3. Interpret objective content

Interpret only the raw Markdown returned by `next-context`; do not inspect repo
source files.

Extract:

- title and status from `body.md`
- short description / goal summary when it adds signal
- progress counts and clearly open work from `roadmap.md` when present
- durable findings / notes presence from `notes.md` when present
- the first open roadmap item that looks like a PR-sized next slice
- a candidate next-slice slug derived semantically from the prose

Do not expect Python-side title parsing, progress parsing, or suggested slug
fields. Semantic reading and naming remain in this skill.

### 4. Report status

Keep the status report tight enough to verify at a glance:

- source label (`current branch <branch>`) and parent objective slug
- content files present
- title and status from the required content file
- completion/progress state, clearly marking open work
- durable findings presence, summarized in one line when present
- freshness advisory, if provided by `next-context`
- description/goals summary only when it adds signal

If the freshness advisory fired, remind the user to run `objective-update
<slug>` on the current branch before creating the next slice branch.

### 5. Suggest the next-slice slug

Default to the first unchecked slice-like item that still fits the objective's
progress guidance. If priority is non-obvious, present 2-3 candidate slugs with
one-line rationales and ask the user to choose.

Slug rules:

- lowercase ASCII, hyphen-separated
- specific to the slice, not the whole objective
- no `.md` suffix
- usually 50 characters or fewer
- no redundant `objective-` prefix and no verbatim repeat of the parent slug

After choosing a candidate, run:

```bash
objective exec next-collision <candidate-slug> --format json
```

Use the returned `clear`, `branch_exists`, and `canonical_exists` facts in the
final report. If `clear` is false, warn and ask the user to choose another slug
or explicitly proceed; do not auto-resolve.

### 6. Final output

Return:

- source label and parent objective slug
- the status summary
- suggested next-slice slug and collision result
- next-step hint:

```text
To proceed: write a plan file using <suggested-slug>, run
brmem-branch-create, navigate to the new branch (your choice of tool),
then run objective-claim <parent-slug>. After implementing the slice,
merge the PR and run objective-reconcile <parent-slug> on the trunk branch.
```

If the freshness advisory fired, prepend a reminder to update the stale current
branch before creating the next slice branch.

## Edge Cases And Anti-Patterns

- Detached `HEAD`, missing claims, trunk-empty states, absent content files, and
  ambiguous current-branch claims are reported by `next-context`; surface the
  helper's message rather than reimplementing probes.
- Branch name does not equal slug. A branch named after a slice commonly carries
  the parent objective's snapshot. Never derive the objective slug from the
  branch name.
- Multiple slugs on the current branch are legitimate when two unrelated parent
  objectives are claimed on the same branch; list both and ask.
- Source has only the required content file: report that no optional progress
  surface exists; fall back to progress guidance, or ask if the next slug is
  ambiguous.
- Current branch is the trunk branch: canonical rewrites go through
  `objective-reconcile`, not `objective-update`; rely on `next-context` for
  trunk-aware guidance.
- Never auto-pick a slug from a multi-slug current branch, auto-resolve a
  collision, inspect source code for drift, attach/carry forward a snapshot,
  walk ancestors or canonical state outside the current branch, or implement
  work during `next`.
