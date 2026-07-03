---
name: objective-refresh
disable-model-invocation: true
description: "Refresh active Objective records without closure and without committing. Default: verify and rebaseline all Objectives evidenced on the current branch; name a slug to refresh just that one; on trunk it rebaselines all active Objectives against landed ground truth. For user-directed updates use objective-update; to explicitly close an Objective use objective-close."
---

# objective-refresh

Refresh active Objective records without closure. Use/read the `objective` umbrella skill first for shared Objective vocabulary, storage, status semantics, and safety rules.

A refresh verifies material claims, rewrites stale durable Objective prose from a verified contract, may append Semantic Updates, never closes Objectives, and never commits. It leaves edits uncommitted in the worktree and returns a report; the user/caller decides how to commit and land. For a user-directed update that may create `closed.md`, use `objective-update` instead.

## Target selection

Never ask a scope question. Targets are determined mechanically:

- **Explicit Objective slug(s) or path(s)** -> refresh exactly those. Stop if a selected Objective is archived unless the user explicitly asks for archive work. On a feature branch, report `not-owned` for a named slug with no branch evidence rather than silently rebaselining trunk state — unless the user clearly asked for a trunk-style rebaseline of that slug.
- **No slug, on a feature branch** -> discover owned slugs from committed and uncommitted branch evidence:

  ```bash
  git -C "$WT" diff --name-only <trunk>...HEAD -- .ji/objectives/
  git -C "$WT" status --porcelain -- .ji/objectives/
  ```

  Reduce paths to `.ji/objectives/<slug>/` and take the union of both lists. If the union is empty, report that the branch evidences no Objective records and stop without writing.
- **No slug, on trunk** -> refresh all active open Objectives from `ji objective list --names` (or `--minimal --format md` for the human view), verifying claims against landed ground truth and writing only where durable prose is stale.

Stop if `HEAD` is detached:

```bash
git -C "$WT" symbolic-ref --quiet --short HEAD
```

Discover trunk with explicit precedence: prefer `gt trunk` when available; otherwise use the repo's configured default branch. If two available sources disagree, stop and ask rather than choosing a write base.

Every git operation uses `git -C "$WT"`. `WT` defaults to the current working directory; a caller may supply another materialized worktree path explicitly. Never check out another branch as part of this workflow.

## Refresh model

Ask: for this target context, what should the Objective record truthfully say as durable ground truth?

The authoring move is a **from-scratch refresh**, not paragraph patching. Read the current Objective text as evidence, extract its core meaning and progress, verify that extracted contract against current ground truth, then rewrite `objective.md` and `roadmap.md` cleanly from that verified contract. Extract first, rewrite second, then diff the rewrite against the extracted contract so no meaning silently falls out.

On a feature branch, frame the target as "if this branch landed now, what should the Objective records touched by this branch say on the default branch?". On trunk, frame it as "what should these records say about current landed ground truth?". Use `objective-update`'s landed-state writing semantics as the content model, but do not run the Closure Gate, do not create `closed.md`, and do not add `## Closure`.

Process exactly one active Objective slug and one target context at a time, looping over the selected slugs. The target is current checkout `HEAD` in `$WT` plus uncommitted worktree state.

## Verify claims

Be aggressively skeptical. Presume every material Objective claim is false until verified against current ground truth.

Material claims include source paths, symbols, commands, packages, workflows, PRs, branches, tests, docs, ADRs, Objective slugs, status words, scope boundaries, non-goals, dependencies, risks, assumptions, completion evidence, and roadmap row rationale. Status words include "exists", "gone", "current", "already", "now", "still", "remaining", "implemented", "deleted", "covered", "tested", "passing", "legacy", "core", "salvaged", "owned", and "deferred".

Objective PR evidence bullets and closure PR summaries are material claims. Verify PR numbers, review/CI status, and merge-state wording before carrying them forward or writing them as refreshed durable prose. Use `merged` wording only when PR evidence confirms merge state; if merge state cannot be verified cheaply, weaken to status-neutral PR evidence, an explicit current/open status, an assumption/open question, or `skipped-unverified` rather than asserting a merge.

For every material claim that the refresh writes, carries forward from the old record, or relies on while extracting the refreshed contract, collect evidence first. Evidence may be repository probes (`test -e`, `find`, `rg`, `git grep`, `git diff`, `git log`), deterministic CLI inventory (`ji objective exec read-objective`, package help/schema output), or PR/CI evidence when the claim is about PR/CI state. Negative claims need scoped absence evidence; "no X" requires a scoped search showing X is absent.

If a claim cannot be verified cheaply, do not leave it as fact. Convert it to an explicit assumption/open question with the missing-evidence scope, park or narrow the roadmap item, or report `skipped-unverified`. If verified evidence contradicts the Objective, correct the extracted contract before rewriting and add a Semantic Update explaining the correction. Never add a Semantic Update that vouches for unverified draft prose.

## Baseline and due-ness

There are no refresh commits and no commit-message baselines. Baselines come from git topology; due-ness is content-level.

- **Feature branch:** baseline is the merge base with trunk:

  ```bash
  git -C "$WT" merge-base <trunk> HEAD
  ```

  The evidence window is `<baseline>..HEAD` plus uncommitted worktree changes. A slug is in scope when its Objective directory changed in the three-dot diff against trunk, when it has uncommitted edits, or when the user points at branch code changes that contradict the slug's claims.
- **Trunk:** no baseline dance. Every selected active open Objective gets claim verification against current `HEAD` ground truth; write only when verification shows durable prose is stale.

Idempotency is content-level: rerunning immediately after a refresh produces no further file modifications, because the record already matches the verified contract. A rerun re-verifies claims rather than short-circuiting on a prior refresh marker.

The Semantic Update provenance line is a human/debug breadcrumb, not a deduplication key. `from=` is the merge-base on a feature branch or `trunk-HEAD` on trunk:

```text
Provenance: objective-refresh basis target=<target-sha-or-ref> from=<merge-base-or-trunk-HEAD>
```

## Write one Objective safely

Uncommitted Objective edits are normal input, not a stop condition: the worktree content (committed plus uncommitted) is the current record and is read as ground truth/source material. Record which slugs had pre-existing uncommitted edits so the final report can list them.

Always enforce these invariants:

- Edit only the selected Objective directories.
- Never edit, rewrite, move, delete, normalize, or recreate an existing file under `updates/`.
- Never move, delete, rename, or recreate Objective slug directories.
- Never edit archived Objectives unless the user explicitly asks for archive work.
- Never create `closed.md` and never add `## Closure`.

If a selected Objective appears to require closure rather than refresh, report it as closure-ready/needs `objective-update`; do not close it.

For each selected slug, run a full refresh loop:

1. **Read the old record as source material.** Use `ji objective exec read-objective <slug> --format md` when available for deterministic inventory and closed-marker state, then focus on `objective.md`, `roadmap.md`, and recent `updates/` only when needed for context.
2. **Gather target evidence** from the baseline to `HEAD` plus worktree state:

   ```bash
   git -C "$WT" log --oneline <baseline>..HEAD -- .ji/objectives/<slug>/
   git -C "$WT" diff --stat <baseline>..HEAD -- .ji/objectives/<slug>/
   git -C "$WT" diff --name-status <baseline>..HEAD -- .ji/objectives/<slug>/
   git -C "$WT" diff <baseline>..HEAD -- .ji/objectives/<slug>/objective.md .ji/objectives/<slug>/roadmap.md
   git -C "$WT" diff -- .ji/objectives/<slug>/
   ```

   On trunk, skip the baseline-range probes and verify against current `HEAD` ground truth plus worktree state.
3. **Extract the refresh contract before editing.** From the old record plus target evidence, write a brief in-session extraction with:
   - core meaning: the Objective's durable purpose, scope boundaries, completion criteria, assumptions/risks, and open questions;
   - progress: completed work, active work, parked/deferred work, closure-adjacent evidence, and remaining roadmap shape;
   - material claims by category: paths/files, symbols/APIs, commands/CLI surface, tests/evidence, status words, boundaries/non-goals, risks/assumptions, and roadmap rationale;
   - stale or suspect text from the old record that must not be carried forward as fact.
4. **Verify the extracted contract** against current ground truth. Use targeted probes rather than vibes:
   - paths/files: `git -C "$WT" ls-files -- <path>`, `test -e`, or `find` scoped to the claimed directory;
   - symbols/commands/types: `rg --fixed-strings`, `rg` with a narrow regex, package `--help`, or schema/help output;
   - "deleted"/"absent"/"no longer": scoped `rg/find/git ls-files` evidence for absence;
   - "implemented"/"covered"/"tested": source plus test probes, and run targeted tests only when the claim depends on passing behavior;
   - PR/CI/review state: `gh`/Graphite evidence when the claim names PR/CI state;
   - ownership or deferral: git diff/log/Objective evidence showing the named owner or deferred target exists.
5. **Classify the slug before writing:**
   - `verified`: the extracted contract is supported or has been weakened into assumptions/open questions.
   - `stale-rebaselined`: at least one old-record claim was false and the extracted contract corrects/parks/narrows it.
   - `skipped-unverified`: important claims remain unverifiable or contradictory and you cannot safely rewrite them without user input.
6. **Rewrite from scratch when a write is warranted.** Do not patch paragraphs or preserve old wording by inertia. Re-author `objective.md` from the verified contract when the target context changes durable narrative, scope, completion criteria, assumptions/risks, open questions, closure-adjacent caveats, or when verification shows existing prose is stale. Do not add `## Closure`.
7. **Rewrite `roadmap.md` from scratch when active work shape changes.** Reconstruct ordered guidance, checkbox state, row notes, completion evidence, and parked work from the verified progress contract. Use only `[ ]`, `[~]`, and `[x]`.
8. **Contract-diff the rewrite before saving as done.** Compare the rewritten files against the extracted contract line by line. Every verified purpose, boundary, progress fact, roadmap item, assumption/open question, and parked/deferred item must be present or intentionally omitted with a reason. If the rewrite drops or softens meaning, fix it before finalizing.
9. **Re-derive `orientation.md` from the verified contract when one exists.** If the slug has an `orientation.md`, rewrite it from the verified contract using the umbrella `objective` skill's orientation re-derivation rule. If the verified contract shows the Objective has become cross-cutting and it lacks one, add `orientation.md` using the umbrella format. Never close, so never drop an `orientation.md` here.
10. Add one new timestamped Semantic Update under `updates/` when the refresh records a meaningful finding, decision, blocker, risk change, completion event, plan change, follow-up, or ground-truth rebaseline. Include the provenance line above and summarize the decisive extraction + verification evidence. If the update writes new Objective PR evidence, use the shared bullet convention, limit it to material Objective PRs, and do not broadly backfill unrelated historical PR mentions.
11. If old records mention PRs inconsistently, do not normalize unrelated history merely to satisfy the convention. Preserve, weaken, correct, or summarize only PR evidence that is material to the selected refresh target and can be verified or clearly labeled.
12. If a slug is in scope but you cannot identify a meaningful durable change, or cannot verify the extracted Objective contract well enough to trust it, do not invent filler. Report `skipped-ambiguous` or `skipped-unverified` and leave the slug unchanged unless you can safely narrow/park false claims.

## Report

Do not commit. Do not stage. Refresh output stays as uncommitted worktree edits; the user/caller decides how to commit and land.

Return a compact report with:

1. Worktree, branch/ref, trunk, target SHA, and baseline per processed slug.
2. Per-slug action: `wrote`, `noop`, `skipped-ambiguous`, `skipped-unverified`, `closure-ready`, or `not-owned`.
3. Claim verification summary: key claims verified, key claims corrected/parked/narrowed, and any claims still treated as assumptions/open questions.
4. Durable files edited and any new Semantic Update filenames.
5. Slugs that had pre-existing uncommitted Objective edits the refresh built on.
6. Confirmation that no existing Semantic Updates were edited, no Objective slug directories were moved/deleted/recreated, no Objective was closed, and nothing was committed.
7. Whether an immediate rerun would modify files (should be no).

## Verify

- New update files, if any, are timestamped and live under the matching Objective's `updates/` directory.
- No existing file under `updates/` changed.
- Required Objective headings remain present in edited files.
- Every material claim in the extracted contract and rewritten Objective prose has supporting evidence, has been weakened to an assumption/open question, or caused `skipped-unverified`.
- Negative claims have scoped absence evidence.
- New Semantic Updates include the decisive verification/rebaseline evidence when they correct stale Objective prose.
- No `closed.md` was created and no `## Closure` was added.
- If `orientation.md` was re-derived or added, it follows the format and reflects the verified contract; no `orientation.md` was dropped (refresh never closes).
- No `git commit` was performed and nothing was staged.
- An immediate rerun produces no further file modifications.
