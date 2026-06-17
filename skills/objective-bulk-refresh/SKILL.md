---
name: objective-bulk-refresh
description: "Bulk refresh all active open Objectives before a context break. Each owning stack tip gets the Objective's full in-place edits; one combined proposal branch off trunk collects append-only Semantic Updates for in-flight Objectives plus full edits for orphans, as a single reviewable PR. Idempotent by recorded basis: a second run with no new Objective changes makes no commits. Use for bedtime Objective refresh, refresh all Objectives, bulk Objective update, or bring all open Objectives up to date."
---

# objective-bulk-refresh

Run an autonomous semantic maintenance pass over every active open Objective so the Objective set is useful after a context break. This is an Objective skill-family workflow: use/read the `objective` umbrella skill first for shared Objective vocabulary, storage, status semantics, and safety rules.

If the user asks what this skill does, explain it without mutating files. If the user asks to run a bedtime Objective refresh, refresh all Objectives, bulk Objective update, or bring all open Objectives up to date, perform this workflow.

## Two write targets

Every run drives all Objective records toward the same up-to-date state through two distinct targets, and is idempotent: a second run that finds no new Objective changes makes no commits.

The Objective record for an in-flight Objective evolves on the downstream branch(es) implementing it, while trunk falls behind. Blindly editing the current checkout (effectively trunk) would either collide with those branches at land/restack time or prematurely flip roadmap `[x]` state on trunk before the work lands. So each run produces two things:

1. **Per owning tip** — the Objective's full in-place `objective.md` / `roadmap.md` edits plus a new basis-stamped Semantic Update, written at the stack leaf that owns the work. Roadmap state flips land *with* the work.
2. **One trunk-rooted proposal branch** — a single dedicated branch off trunk (default name `objective-refresh-proposal`), opened as one combined Objective-refresh PR, carrying:
   - for **in-flight** Objectives: **only** the append-only Semantic Update files — the *same* basis-stamped files deposited at the tips, `updates/` only, never in-place roadmap/objective edits, so trunk never claims completion ahead of the code;
   - for **orphan** Objectives (alive on no branch): the **full** edits, since trunk is their only source of truth.

This honors "never commit directly to main": tip writes land on the owning leaf; trunk-facing writes land on a real proposal branch that reaches trunk via a normal PR. Cases that cannot be written safely **degrade** to a recommendation and write nothing.

Classification routes each Objective:

- **Alive on exactly one stack** → tip = that stack's single leaf.
- **Alive on two or more stacks** → write at each owning tip, scoped to each branch's own diff; the proposal branch still gets one shared append-only update per Objective.
- **Alive nowhere (orphan)** → full edits on the proposal branch.
- **Cannot be written safely (degrade)** → routing recommendation only.

## Graphite dependency

This is an explicitly Graphite-named workflow. It depends on Graphite plumbing to learn stack topology and worktree placement:

- `slot gt exec stack-map-branches --format json` for the full branch graph + worktree map.
- `gt trunk`, `gt parent --no-interactive`, `gt children --no-interactive` if you need a single edge.

Never parse human-facing `gt ls`, `gt log`, or `gt branch info` output for machine topology decisions. If Graphite metadata is missing or stale (see `warnings[]` in the map), degrade affected Objectives rather than guessing.

## Concept

This is not a per-Objective picker and not a ceremonial changelog. Assess every active open Objective, attribute it to the branches that own its work, and converge all records on the up-to-date state through the two targets above.

Keep two questions separate:

- **Whether a deposit is produced is deterministic, not a judgment.** It is keyed on the Objective record **basis** (step 5): a target receives a deposit exactly when its source-of-truth Objective directory differs from the basis last recorded there. Same state → same basis → no deposit → no-op. This is what makes re-runs idempotent and guarantees the proposal branch exists whenever an Objective has genuinely moved.
- **Materiality shapes the body, never gates existence.** When a basis change makes a deposit due, write a substantive Semantic Update describing what actually changed; never pad with "checked today" filler. When the basis is unchanged, write nothing at all.

Material context for the body means at least one of:

- facts changed;
- work completed, de-risked, blocked, or invalidated earlier assumptions;
- thesis, scope, risks, open questions, roadmap guidance, or follow-up clarity is stale, thin, or underspecified enough that bounded evidence gathering can improve it.

## Objective surfaces and invariants

Active Objectives live under `.asdl/objectives/<slug>/`:

- `objective.md` contains durable purpose, boundaries, completion criteria, assumptions/risks, open questions, and optional closure context.
- `roadmap.md` contains ordered semantic work using only `[ ]`, `[~]`, and `[x]` states.
- `updates/` contains immutable Semantic Updates. Never edit, rewrite, move, delete, or normalize an existing update file. If later evidence changes earlier context, create a new update instead.
- `closed.md` is a closure marker. This bulk refresh evaluates closure readiness but must not create `closed.md`.

A deposited Semantic Update captures the distinct semantic events, decisions, blockers, risk changes, completion evidence, or provenance-worthy findings accumulated since the last recorded basis. The basis (step 5) decides *when* one is due; keep the body substantive rather than ceremonial. Use a timestamped, human-readable filename following the existing `objective-update` convention in the repo. Include enough seconds-resolution and slug detail to avoid filename collisions, and use the *same* filename for the tip and proposal-branch copies of an in-flight Objective's update so the later land is a conflict-free identical add.

## Preconditions

- The skill must run from a **real-branch worktree** (e.g. a slot holding a checked-out branch). `stack-map-branches` fails on a detached HEAD. If the current checkout is detached, stop and ask.
- Trunk-facing writes go on a dedicated branch rooted at trunk (default name `objective-refresh-proposal`), **never** the slot's current feature branch. The run reuses that branch if it already exists and creates it from trunk only when there is something to deposit — so a clean re-run leaves no empty branch and opens no PR.

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

### 5. Compute the basis (idempotency + deposit trigger)

Each deposited Semantic Update records its **basis** as a human-readable provenance line:

```
Provenance: bulk-refresh basis tip=<owning-sha> record=<objective-tree-sha>
```

`record=<objective-tree-sha>` is the tree SHA of `.asdl/objectives/<slug>/` at the deposit's source of truth — the owning leaf for in-flight Objectives, trunk for orphans. It is both the idempotency key and the deposit trigger:

```bash
# in-flight: at the owning leaf worktree <wt>
git -C <wt> rev-parse <leaf>
git -C <wt> rev-parse <leaf>:.asdl/objectives/<slug>
# orphan: at trunk
git rev-parse <trunk>:.asdl/objectives/<slug>
```

Before depositing at a target, scan that target's `updates/` for a provenance line whose `record=` matches the computed tree SHA. Check **every** target independently: the owning tip's `updates/`, the proposal branch's `updates/`, and trunk's `updates/` (a matching basis already on trunk means a prior proposal landed — nothing to re-propose). If the basis is present at a target, **skip that target**. A target receives a deposit only when its source-of-truth record tree differs from the last basis recorded there — that difference is the materiality signal and the no-op guard at once.

### 6. Deposit

Carry over the immutable-`updates/`, one-directory-at-a-time, and never-close rules from "Write rules" below. Build the body only when a basis change makes a deposit due; make it substantive, never filler.

**Tip writes (in-flight Objectives).** For each owning leaf with a clean worktree (step 4):

- **single-owner** — in the leaf's worktree: full in-place `roadmap.md` / `objective.md` edits plus a new `updates/<ts>-<slug>.md` carrying the provenance line. One labeled commit aggregating all Objectives owned by that tip.
- **multi-owner** — write at each owning tip, **scoped to that branch's own diff**:

  ```bash
  git -C <wt> diff <trunk>...<branch> -- .asdl/objectives/<slug>/roadmap.md
  ```

  Use three-dot (merge-base relative) so rows already landed on trunk by another stack don't masquerade as this branch's edits. Apply only the in-place edits attributable to that branch's diff (disjoint rows → conflict-free across tips). Where two tips would edit the **same** region, do not edit in place there: drop the append-only `updates/` note at both tips and raise a reconciliation flag in the report.
- **open-PR tip** — write anyway. Use a clearly-labeled commit message and report it prominently so the PR author sees it. Detect PR state with `gh pr view <leaf> --json state` (see the `code-gh` skill).

**Trunk proposal (one combined branch).** After tip writes, collect every deposit due for trunk:

- each **in-flight** Objective with a due basis contributes the **same** basis-stamped `updates/<ts>-<slug>.md` file (identical content and filename to its tip deposit) — `updates/` only, no `roadmap.md` / `objective.md` edits.
- each **orphan** Objective with a due basis contributes the **full** edits (`objective.md` / `roadmap.md` + a basis-stamped `updates/` file), since trunk is its only source of truth.

If nothing is due, make no branch and no commit. Otherwise:

1. Reuse the existing `objective-refresh-proposal` branch (rooted at trunk) if present; else create it from trunk. Operate through its own worktree — do not disturb the slot's feature branch.
2. Apply the collected deposits as one self-identifying commit: `[objective-bulk-refresh] trunk proposal: <n> Objectives`.
3. Submit/update one combined PR (`gt submit --no-interactive`; see the `graphite` skill).

Depositing the identical basis-stamped update file at both the tip and the proposal branch means that when the feature branch later lands, the file is already on trunk — an identical add, conflict-free.

**Degrade cases** — write nothing; emit a routing recommendation naming the target branch/leaf and the reason.

Commit messages for tip writes must be self-identifying, e.g. `[objective-bulk-refresh] refresh <slug> at tip`.

## Write rules

- Edit only one Objective directory at a time.
- At a **tip**, you may edit `objective.md` and `roadmap.md` and add an `updates/` file.
- On the **trunk proposal branch**, in-flight Objectives receive **append-only `updates/` files only** — never edit their `objective.md` / `roadmap.md` there. Only **orphan** Objectives receive full edits on the proposal branch.
- Each deposited `updates/` file carries the provenance line from step 5.
- Never edit existing files under `updates/`.
- Never move, delete, rename, or recreate Objective slug directories.
- Never edit archived Objectives unless the user explicitly asks for archive work.
- Do not close Objectives during bulk refresh: do not create `closed.md` and do not add `## Closure` as part of this workflow.

Deposit whenever the basis is due and the target is safe; do not pause for per-Objective approval. Degrade and report unsafe or ambiguous Objectives instead of asking inside the loop. The pass is fully autonomous — compute and write in one pass, no preview/confirm gate.

## Stop and ask conditions

Stop or ask the user instead of guessing if:

- the current checkout is detached (topology map fails; no stable base to root the proposal branch);
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

| Objective | Action | Target leaf / worktree | Basis (record tree SHA) | Material evidence | Notes |
| --------- | ------ | ---------------------- | ----------------------- | ----------------- | ----- |

Use one of these actions: `wrote-tip+proposal` (tip in-place edits plus the mirrored append-only update on the proposal branch), `wrote-at-tip` (tip only — e.g. proposal copy already on trunk), `wrote-orphan-proposal` (full orphan edits on the proposal branch), `noop-basis` (basis unchanged at all targets; nothing written), `routed` (degraded, with reason), `note+flag` (multi-owner overlap), `skipped/ambiguous`, `closure-ready`. A closure-ready Objective may also have refresh edits, but make clear that it was not closed.

3. The trunk proposal: branch name, PR link, and the Objectives it carries — or an explicit statement that nothing was due, so no branch/PR was created.
4. Closure-ready candidates, if any, with rationale.
5. Short next-morning priority recommendations: the few Objectives or branches most worth picking up next and why.
6. Confirmation that no existing Semantic Update files were edited, no Objectives were closed, no edits were committed to the slot's feature branch or directly to trunk, and that a clean re-run would be a no-op.
