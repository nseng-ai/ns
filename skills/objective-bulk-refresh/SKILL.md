---
name: objective-bulk-refresh
description: "Bulk refresh all active open Objectives before a context break: route each Objective's update to the tip of the stack that owns that work, update untouched Objectives on the sweep's own branch, and report degraded/ambiguous/closure-ready records. Use for bedtime Objective refresh, refresh all Objectives, bulk Objective update, or bring all open Objectives up to date."
---

# objective-bulk-refresh

Run an autonomous semantic maintenance pass over every active open Objective so the Objective set is useful after a context break. This is an Objective skill-family workflow: use/read the `objective` umbrella skill first for shared Objective vocabulary, storage, status semantics, and safety rules.

If the user asks what this skill does, explain it without mutating files. If the user asks to run a bedtime Objective refresh, refresh all Objectives, bulk Objective update, or bring all open Objectives up to date, perform this workflow.

## Why routing exists

The Objective record for an in-flight Objective is usually being edited on the downstream branch(es) implementing it. Writing that Objective's refresh into the current checkout (effectively trunk) creates trunk edits that collide with those branches at land/restack time. So this skill does not blindly edit the current checkout. Instead it **routes** each Objective's update to where the work lives:

- **Alive on exactly one stack** → write at that stack's leaf (tip) worktree.
- **Alive on two or more stacks** (e.g. an Objective implemented on multiple branches) → write per-tip, scoped to each branch's own diff.
- **Alive nowhere** (orphan) → write on the sweep's own branch, which reaches trunk via a normal PR.
- **Cannot be written safely** (degrade) → emit a routing recommendation, write nothing.

This honors "never commit directly to main": every write lands on a real branch (an owning leaf or the sweep's own branch), never on trunk in place.

## Graphite dependency

This is an explicitly Graphite-named workflow. It depends on Graphite plumbing to learn stack topology and worktree placement:

- `slot gt exec stack-map-branches --format json` for the full branch graph + worktree map.
- `gt trunk`, `gt parent --no-interactive`, `gt children --no-interactive` if you need a single edge.

Never parse human-facing `gt ls`, `gt log`, or `gt branch info` output for machine topology decisions. If Graphite metadata is missing or stale (see `warnings[]` in the map), degrade affected Objectives rather than guessing.

## Concept

This is not a per-Objective picker and not a ceremonial changelog. Assess every active open Objective, attribute it to the branches that own its work, route each update to the correct branch tip, update only where materiality is clear, degrade unsafe cases to recommendations, and report closure-ready candidates without closing them.

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

A new Semantic Update is optional and should be selective: create one only for distinct semantic events, decisions, blockers, risk changes, completion evidence, or provenance-worthy findings. Use a timestamped, human-readable filename following the existing `objective-update` convention in the repo. Include enough seconds-resolution and slug detail to avoid filename collisions.

## Preconditions

- The skill must run from a **real-branch worktree** (e.g. a slot holding a checked-out branch). `stack-map-branches` fails on a detached HEAD, and the orphan/trunk path commits to the current branch. If the current checkout is detached, stop and ask.
- The sweep commits orphan-Objective updates to the **current branch** and does not auto-submit a PR. If you want orphan updates isolated from existing branch work, create a dedicated branch first (`code-autobranch` / `gt create` semantics) before running.

## Algorithm

### 1. Inventory

```bash
objective list --status open --format json
```

`.data` returns `trunkBranch` plus `records[]`, each `{ slug, status, latestUpdateIso, updatedBranches[], hasOutstandingChanges }`. `updatedBranches` is the deterministic attribution signal: branches whose committed `.asdl/objectives/<slug>/` tree differs from trunk and that touched the slug in `trunk..branch`.

If `records` is empty, report that there are no active open Objectives and stop.

Note: attribution is **committed** divergence only. Uncommitted-only edits on a branch do not appear here.

### 2. Topology + worktree map

```bash
slot gt exec stack-map-branches --format json
```

`.data` returns `branches[]` (`{ name, parent, children[], validation_result, needs_restack }`), `edges[]`, `slots[]` (`{ slot_name, branch, worktree_path, status }`), `trunk`, and `warnings[]`. Build two indexes: branch → `worktree_path` (from `slots[]`), and the child/parent graph (from `branches[]`). Keep `warnings[]` — branches named in warnings have unreliable topology and must degrade.

### 3. Classify each Objective

For each open Objective, intersect its `updatedBranches` with the topology graph and group the owning branches by stack:

- **orphan** — `updatedBranches` is empty (after dropping `backup/*` and non-topology branches): alive nowhere.
- **single-owner** — owning branches form one stack with a single leaf.
- **multi-owner** — owning branches span two or more distinct stacks.
- **degrade** — any of: the target leaf is not materialized in a worktree; its worktree is dirty under the slug; the stack forks on the path to the leaf (`children.length > 1`); the owning branch is detached-pool / Graphite-untracked / named in `warnings[]`.

Find a stack's leaf by walking `children[]` to the branch with no children. A fork (more than one child on the path) means there is no single leaf → degrade. Do not loop `stack-branches` per branch (it is anchored to the cwd branch and hard-fails on forks); derive leaves from the map graph.

Ignore `backup/*` branches as attribution noise — they are not write targets.

### 4. Safety probe at each target leaf

For a candidate leaf with worktree `<wt>`:

```bash
git -C <wt> status --porcelain -- .asdl/objectives/<slug>/
```

Any output → the tip is dirty under this slug → degrade (do not write). Do **not** auto-materialize a missing worktree: you cannot double-checkout a branch and creating a worktree is a side effect. A leaf with no worktree degrades to a recommendation.

### 5. Dedup against prior deposits

Each auto-deposit records its **basis** as a human-readable provenance line in the new `updates/` file:

```
Provenance: bulk-refresh basis tip=<leaf-sha> record=<objective-tree-sha>
```

Compute the basis at the target leaf:

```bash
git -C <wt> rev-parse <leaf>
git -C <wt> rev-parse <leaf>:.asdl/objectives/<slug>
```

Scan the slug's existing `updates/` for a provenance line covering that basis. If one exists, **skip** (no-op dedup) — nothing changed since the last deposit. This makes re-runs a cheap no-op when the basis is unchanged.

### 6. Write (only when materiality is clear)

Carry over the materiality bar, immutable-`updates/`, one-directory-at-a-time, and never-close rules from "Write rules" below.

- **single-owner clean tip** — work in the leaf's worktree: make in-place `roadmap.md` / `objective.md` edits plus a new `updates/<ts>-<slug>.md` carrying the provenance line. One labeled commit aggregating all Objectives owned by that tip.
- **multi-owner** — write at each owning tip, **scoped to that branch's own diff**:

  ```bash
  git -C <wt> diff <trunk>...<branch> -- .asdl/objectives/<slug>/roadmap.md
  ```

  Use three-dot (merge-base relative) so rows already landed on trunk by another stack don't masquerade as this branch's edits. Apply only the in-place edits attributable to that branch's diff (disjoint rows → conflict-free across tips). Where two tips would edit the **same** region, do not edit in place there: degrade that overlap to an append-only `updates/` note plus a reconciliation flag in the report.
- **orphan** — make edits in the current checkout and commit them to the **current branch** (no auto-submit). These reach trunk via that branch's normal PR.
- **open-PR tip** — write anyway. Use a clearly-labeled automated-Objective-update commit message and report it prominently so the PR author sees it. Detect PR state with `gh pr view <leaf> --json state` (see the `code-gh` skill).
- **degrade cases** — write nothing; emit a routing recommendation naming the target branch/leaf and the reason.

Commit messages for routed writes must be self-identifying, e.g. `[objective-bulk-refresh] refresh <slug> at tip`.

## Write rules

- Edit only one Objective directory at a time.
- You may edit `objective.md` and `roadmap.md`.
- You may create new timestamped human-readable files under `updates/` for distinct semantic updates; each auto-deposit carries the provenance line from step 5.
- Never edit existing files under `updates/`.
- Never move, delete, rename, or recreate Objective slug directories.
- Never edit archived Objectives unless the user explicitly asks for archive work.
- Do not close Objectives during bulk refresh: do not create `closed.md` and do not add `## Closure` as part of this workflow.

Write directly when materiality is clear and the target is safe; do not pause for per-Objective approval. Degrade and report unsafe or ambiguous Objectives instead of asking inside the loop. The pass is fully autonomous — compute and write in one pass, no preview/confirm gate.

## Stop and ask conditions

Stop or ask the user instead of guessing if:

- the current checkout is detached (no branch to host orphan writes; topology map fails);
- the active Objective inventory cannot be obtained;
- the topology map fails entirely (no Graphite metadata at all);
- an Objective appears to require closure rather than refresh;
- materiality depends on product intent, priority, or ownership that is not present in repo evidence;
- the requested action would edit existing Semantic Updates, move/delete Objective directories, archive records, or create `closed.md`.

Per-Objective unsafe cases (dirty tip, fork, unmaterialized leaf, stale metadata) **degrade** to a recommendation; they do not stop the whole pass.

## Final response

Return a compact report with:

1. Validation/evidence commands run, including any limitations (e.g. truncated attribution, metadata warnings).
2. A per-Objective table:

| Objective | Action | Target leaf / worktree | Basis (tip SHA) | Material evidence | Notes |
| --------- | ------ | ---------------------- | --------------- | ----------------- | ----- |

Use one of these actions: `wrote-at-tip`, `wrote-orphan`, `routed` (degraded, with reason), `note+flag` (multi-owner overlap), `noop-dedup`, `materiality-recommendation` (work advanced an Objective without touching its record), `skipped/ambiguous`, `closure-ready`. A closure-ready Objective may also have refresh edits, but make clear that it was not closed.

3. Closure-ready candidates, if any, with rationale.
4. Short next-morning priority recommendations: the few Objectives or branches most worth picking up next and why.
5. Confirmation that no existing Semantic Update files were edited, no Objectives were closed, and no edits were committed directly to trunk.
