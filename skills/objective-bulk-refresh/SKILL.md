---
name: objective-bulk-refresh
description: "Bulk refresh all active open Objectives before a context break by fanning out to each genuine owning Graphite tip. Uses objective-branch-refresh at safe materialized tips, reports unsafe targets, and reports orphans as deferred proposal work. Never closes Objectives."
---

# objective-bulk-refresh

Run an autonomous semantic maintenance pass over every active open Objective so each genuine owning branch tip has up-to-date Objective records before a context break. This is an Objective skill-family workflow: use/read the `objective` umbrella skill first for shared Objective vocabulary, storage, status semantics, and safety rules.

If the user asks what this skill does, explain it without mutating files. If the user asks to run a bedtime Objective refresh, refresh all Objectives, bulk Objective update, or bring all open Objectives up to date, perform this workflow.

## V1 shape: fan-out only

This skill is a thin orchestrator over the branch-scoped primitive `objective-branch-refresh`.

It discovers active open Objectives and Graphite topology, classifies which branch tips genuinely own each Objective record, and applies the `objective-branch-refresh` procedure at each safe materialized owning tip. It does not create a trunk proposal branch in v1.

Orphans are reported as `deferred-proposal`: there is no safe write target for them until the parked proposal-branch phase is implemented.

## Relationship to adjacent Objective workflows

| Skill                      | Scope                                          | Closes?                       | Driver                    |
| -------------------------- | ---------------------------------------------- | ----------------------------- | ------------------------- |
| `objective-update`         | one user-chosen Objective                      | yes, through its Closure Gate | user                      |
| `objective-branch-refresh` | all Objectives owned by one branch, at its tip | no                            | autonomous / orchestrator |
| `objective-bulk-refresh`   | every genuine owning tip                       | no                            | autonomous sweep          |

Skills do not call each other as tools. This orchestrator documents how an agent should follow the `objective-branch-refresh` procedure in each target worktree using `git -C <wt>`.

## Graphite dependency

This is an explicitly Graphite/topology workflow. It depends on Graphite plumbing to learn stack topology and worktree placement:

- `slot gt exec stack-map-branches --format json` for the full branch graph and worktree map.
- `gt trunk`, `gt parent --no-interactive`, or `gt children --no-interactive` only when a single edge is needed.

Never parse human-facing `gt ls`, `gt log`, or `gt branch info` output for machine topology decisions. If Graphite metadata is missing or stale, degrade affected Objectives rather than guessing.

## Objective surfaces and invariants

Active Objectives live under `.asdl/objectives/<slug>/`:

- `objective.md` contains durable purpose, boundaries, completion criteria, assumptions/risks, open questions, and optional closure context.
- `roadmap.md` contains ordered semantic work using only `[ ]`, `[~]`, and `[x]` states.
- `updates/` contains immutable Semantic Updates. Never edit, rewrite, move, delete, or normalize an existing update file.
- `closed.md` is a Closure Marker. This bulk refresh may notice closure readiness but must not create `closed.md`.

Never move, delete, rename, or recreate Objective slug directories. Never edit archived Objectives unless the user explicitly asks for archive work.

## Stop and ask conditions

Stop or ask the user instead of guessing if:

- the orchestrator checkout is detached;
- active Objective inventory cannot be obtained;
- the topology map fails entirely;
- an Objective appears to require closure rather than refresh;
- materiality depends on product intent, priority, or ownership that is not present in repo evidence;
- the requested action would edit existing Semantic Updates, move/delete Objective directories, archive records, or create `closed.md`.

Per-Objective unsafe cases degrade to recommendations and do not stop the whole pass.

## Algorithm

### 1. Inventory

```bash
objective list --status open --format json
```

The current CLI contract returns `.data.trunkBranch` and `.data.records[]`; records include `slug` and `updatedBranches`. If this JSON shape has drifted, inspect the live command output and update the skill text to match rather than guessing.

If there are no active open records, report that there are no active open Objectives and stop.

Note: attribution is committed divergence only. Uncommitted-only edits on a branch do not appear in Objective inventory.

### 2. Topology and worktree map

```bash
slot gt exec stack-map-branches --format json
```

The current command returns `.data.branches[]`, `.data.slots[]`, `.data.trunk`, and `.data.warnings[]`. Build these indexes:

- branch name -> worktree path, from slots with a materialized worktree;
- branch name -> parent and children, from the branch graph;
- warning branch names or warning messages that identify unreliable Graphite metadata.

If the topology command fails entirely, stop. If individual branches have warnings or missing worktrees, degrade only affected Objectives. If Objective inventory and topology report different trunk branches, stop and ask; do not choose a write base by preference.

### 3. Filter staleness artifacts

`updatedBranches` is intentionally conservative and can be inflated by branches cut from an older trunk. A branch is a genuine owner for a slug only if its three-dot diff against trunk is non-empty for that Objective directory:

```bash
git -C <wt> diff --quiet <trunk>...<branch> -- .asdl/objectives/<slug>/
```

Drop non-topology branches, `backup/*` branches, branches without reliable metadata, and branches that fail the genuine-owner diff. Preserve the evidence in the report so users can see which apparent owners were staleness artifacts.

### 4. Classify each Objective

After the staleness-artifact filter, classify each Objective:

- **single-owner**: exactly one genuine owning stack path has one safe leaf target.
- **multi-owner**: two or more genuine owning tips remain.
- **orphan**: zero genuine owners remain; report `deferred-proposal` in v1 and write nothing.
- **degrade**: a candidate owner cannot be written safely.

Find a stack leaf by walking children in the topology graph to the descendant with no children. If a path forks (`children.length > 1`) before a unique leaf is determined, degrade that target; there is no single safe tip.

### 5. Safety probe at each candidate target

For a candidate leaf with worktree `<wt>` and slug `<slug>`:

```bash
git -C <wt> status --porcelain -- .asdl/objectives/<slug>/
```

Any output means the tip is dirty under this slug; degrade that Objective/target and write nothing there.

Do not auto-materialize missing worktrees. A leaf with no worktree degrades to a routing recommendation.

Graphite-untracked branches, branches named in warnings, and unsafe forked paths also degrade. An open PR tip is not a degrade: write at the tip if otherwise safe and flag the report prominently so the PR author sees the Objective-refresh commit.

### 6. Fan out with `objective-branch-refresh`

Group safe slugs by owning leaf worktree. For each worktree group, follow the `objective-branch-refresh` procedure with:

- `WT=<leaf worktree_path>`
- explicit slug list = the slugs owned by that leaf after filtering
- trunk = inventory/topology trunk

The primitive owns due-checks, durable Objective authoring, Semantic Update creation, and the branch-tip commit.

### 7. Multi-owner overlap policy

For multi-owner Objectives, scope each tip to that branch's own three-dot diff:

```bash
git -C <wt> diff <trunk>...<branch> -- .asdl/objectives/<slug>/roadmap.md .asdl/objectives/<slug>/objective.md
```

Compare owning branches at the hunk/section level:

- If branches touch disjoint roadmap rows, headings, or prose paragraphs, each tip may receive its own scoped in-place edits through `objective-branch-refresh`.
- If two tips require edits to the same roadmap row, heading section, or paragraph and the durable wording cannot be made branch-local without misrepresenting the other branch, do not edit that region in place. Add append-only Semantic Updates at the affected tips when meaningful, and report `note+flag` with a reconciliation recommendation.

Ambiguous overlap degrades only the affected Objective/target; continue the rest of the pass.

### 8. Parked fast-follow: trunk proposal branch

The old trunk proposal behavior is intentionally parked in v1. Do not create or update `objective-refresh-proposal` from this skill.

Fast-follow design, not part of this implementation: a dedicated proposal branch rooted at trunk would collect mirrored append-only updates for in-flight Objectives and full edits for orphans. Until that phase lands, orphans have no write target and must be reported as `deferred-proposal`.

## Degrade cases

Write nothing for the affected Objective/target and emit a routing recommendation for:

- unmaterialized target leaf;
- dirty Objective directory at the target tip;
- forked path with no unique leaf;
- Graphite-untracked branch or topology warning;
- branch that is only a staleness artifact after the three-dot filter;
- same-region multi-owner overlap that cannot be resolved branch-locally;
- Objective needing closure rather than refresh.

## Final response

Return a compact report with:

1. Validation/evidence commands run, including any limitations or topology warnings.
2. A per-Objective table:

| Objective | Action | Target leaf / worktree | Evidence | Notes |
| --------- | ------ | ---------------------- | -------- | ----- |

Use action labels such as:

- `wrote-at-tip`
- `noop-baseline`
- `deferred-proposal`
- `routed`
- `note+flag`
- `closure-ready`
- `skipped/ambiguous`

3. Degrade list with concrete next-pickup recommendations.
4. Confirmation that no existing Semantic Update files were edited, no Objectives were closed, no Objective slug directories were moved/deleted/recreated, and no trunk proposal branch was created.
5. Whether a clean rerun should be a no-op for targets that were refreshed.

## Verify

- Each refreshed tip has at most one self-identifying `[objective-branch-refresh]` commit for this pass.
- No writes landed in the orchestrator worktree unless it was also a target worktree.
- Orphans were reported as `deferred-proposal`, not written.
- No existing files under `updates/` changed.
- No `closed.md` was created and no `## Closure` was added.
- A full clean rerun makes no commits at targets with no further Objective changes.
