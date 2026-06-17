---
name: objective-bulk-refresh
description: "Bulk refresh all active open Objectives before a context break: assess every Objective, gather bounded repo/worktree evidence, update only material durable context, and report skipped/ambiguous/closure-ready records. Use for bedtime Objective refresh, refresh all Objectives, bulk Objective update, or bring all open Objectives up to date."
---

# objective-bulk-refresh

Run an autonomous semantic maintenance pass over every active open Objective so the Objective set is useful after a context break. This is an Objective skill-family workflow: use/read the `objective` umbrella skill first for shared Objective vocabulary, storage, status semantics, and safety rules.

If the user asks what this skill does, explain it without mutating files. If the user asks to run a bedtime Objective refresh, refresh all Objectives, bulk Objective update, or bring all open Objectives up to date, perform this workflow.

## Concept

This is not a per-Objective picker and not a ceremonial changelog. Assess every active open Objective, inspect local worktrees and branches for material durable context, update only Objectives where materiality is clear, skip ambiguous cases, and report closure-ready candidates without closing them.

Material context means at least one of:

- facts changed;
- work completed, de-risked, blocked, or invalidated earlier assumptions;
- thesis, scope, risks, open questions, roadmap guidance, or follow-up clarity is stale, thin, or underspecified enough that bounded evidence gathering can improve it.

Do not write "checked today" updates or other no-op maintenance notes.

## Objective surfaces and invariants

Active Objectives live under `.asdl/objectives/<slug>/`:

- `objective.md` contains durable purpose, boundaries, completion criteria, assumptions/risks, open questions, and optional closure context.
- `roadmap.md` contains ordered semantic work using only `[ ]`, `[~]`, and `[x]` states.
- `updates/` contains immutable Semantic Updates. Never edit, rewrite, move, delete, or normalize an existing update file. If later evidence changes earlier context, create a new update instead.
- `closed.md` is a closure marker. This bulk refresh evaluates closure readiness but must not create `closed.md`.

A new Semantic Update is optional and should be selective: create one only for distinct semantic events, decisions, blockers, risk changes, completion evidence, or provenance-worthy findings. Use a timestamped, human-readable filename following the existing `objective-update` convention in the repo.

## Inventory

1. Run `objective list --minimal --format md` for the human-readable active-open inventory.
2. Use `objective list --names` when machine-readable slugs are useful.
3. If there are no active open Objectives, report that and stop.

Do not invent filesystem scans or infer active Objectives from branches, PRs, or prose.

## Evidence collection

Start repo-local and inspect all local worktrees and branches, not just the current checkout. Useful commands include:

```bash
git worktree list --porcelain
git branch --format='%(refname:short)'
git status --short
```

For relevant worktrees/branches, inspect status, diffs, commit logs, and PR breadcrumbs as needed. For base discovery, reuse `objective-update` semantics: prefer Graphite parent when available for the relevant branch or checkout, otherwise PR base when available, otherwise trunk/default git best effort. Do not parse human-facing `gt ls`, `gt log`, or `gt branch info` output for machine topology; use plumbing commands or explicit Objective/PR evidence instead.

Evidence from unlanded non-current branches/worktrees is qualified context by default. Record branch/worktree/PR breadcrumbs when useful. Do not mark Objective work complete unless evidence is decisive.

For underspecified Objectives, perform limited targeted code, documentation, branch, PR, or update archaeology to improve thesis, scope, risks, open questions, roadmap sequencing, or follow-up clarity. External web research is allowed only when materially needed by that Objective; summarize findings inline with provenance and avoid broad web exploration.

## Per-Objective review loop

For each active slug:

1. Read the Objective with `objective exec read-objective <slug> --format md` or direct file reads.
2. Compare the Objective record against repo/worktree/branch evidence.
3. Decide materiality:
   - changed facts;
   - completed, de-risked, newly blocked, or invalidated work;
   - changed assumptions, risks, or open questions;
   - stale or thin thesis/scope/completion criteria;
   - unclear roadmap sequencing or missing follow-up guidance;
   - bounded research findings that materially improve the Objective.
4. If materiality is clear, update that Objective directory before moving to the next one.
5. If evidence is ambiguous, skip the Objective and record what would need clarification.

## Write rules

- Edit only one Objective directory at a time.
- You may edit `objective.md` and `roadmap.md`.
- You may create new timestamped human-readable files under `updates/` for distinct semantic updates.
- Never edit existing files under `updates/`.
- Never move, delete, rename, or recreate Objective slug directories.
- Never edit archived Objectives unless the user explicitly asks for archive work.
- Do not close Objectives during bulk refresh: do not create `closed.md` and do not add `## Closure` as part of this workflow.

Write directly when materiality is clear; do not pause for per-Objective approval. Skip and report ambiguous Objectives instead of asking inside the loop.

## Stop and ask conditions

Stop or ask the user instead of guessing if:

- active Objective inventory cannot be obtained;
- local worktree/branch evidence is unavailable or contradictory in a way that affects multiple writes;
- an Objective appears to require closure rather than refresh;
- materiality depends on product intent, priority, or ownership that is not present in repo evidence;
- the requested action would edit existing Semantic Updates, move/delete Objective directories, archive records, or create `closed.md`.

## Final response

Return a compact report with:

1. Validation/evidence commands run, including any limitations.
2. A per-Objective table:

| Objective | Action | Files changed | Material evidence | Notes |
| --- | --- | --- | --- | --- |

Use `updated`, `skipped`, `ambiguous`, or `closure-ready` as the action. A closure-ready Objective may also have refresh edits, but make clear that it was not closed.

3. Closure-ready candidates, if any, with rationale.
4. Short next-morning priority recommendations: the few Objectives or branches most worth picking up next and why.
5. Confirmation that no existing Semantic Update files were edited and no Objectives were closed.
