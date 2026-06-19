---
name: objective-branch-refresh
description: "Refresh all Objective records genuinely in scope for one branch or explicit branch-like context without closure. Uses objective-refresh as the one-Objective primitive. Use for refreshing this branch's Objectives, bringing branch Objective tracking up to date, or explicit trunk named-slug non-closing refresh. For one chosen Objective use objective-refresh; for closure use objective-update."
---

# objective-branch-refresh

Refresh all Objective records genuinely in scope for one branch or explicit branch-like context. This is an Objective skill-family workflow: use/read the `objective` umbrella skill first for shared Objective vocabulary, storage, status semantics, and safety rules.

This skill is an orchestrator. It discovers or receives the Objective slugs for one target context, checks branch/trunk ownership and safety, then follows the `objective-refresh` procedure for each due, clean slug. It never closes Objectives. For a single chosen Objective, use `objective-refresh`; for any workflow that may create `closed.md`, use `objective-update`.

## Concept

A branch refresh asks: if this branch landed now, what should the Objective records touched by this branch say on the default branch?

A trunk refresh asks: now that work has landed on the default branch, what should these explicitly named Objective records say about current ground truth?

Use `objective-refresh` as the per-Objective authoring and verification model. Update durable Objective prose only when target evidence makes the current record stale, incomplete, or misleading. Do not write ceremonial "checked today" updates.

## Invocation modes

Use one code path for all modes. Every git operation must use `git -C "$WT"`; never check out another branch as part of this workflow.

- **Feature-branch standalone mode:** `WT` is the current working directory, target is `HEAD`, and the slug list is discovered from the branch's Objective diff against trunk unless the user supplied explicit slug(s).
- **Trunk standalone mode:** `WT` is the current working directory on trunk, target is `HEAD`, and the user must supply explicit Objective slug(s) or paths. If no slug is explicit on trunk, stop and ask which active Objective(s) to refresh; do not scan every Objective automatically.
- **Orchestrated mode:** the caller supplies `WT=<slot worktree_path>`, trunk/base evidence, and an explicit Objective slug list. This is how `objective-repo-refresh` applies branch-scoped refreshes to materialized stack targets.

Stop if `WT` is not on a real branch:

```bash
git -C "$WT" symbolic-ref --quiet --short HEAD
```

Discover trunk with explicit precedence. In orchestrated mode, use the orchestrator-supplied trunk only after it has reconciled Objective inventory and topology. In standalone mode, prefer `gt trunk` when available; otherwise use the repo's configured default branch. If two available sources disagree, stop and ask rather than choosing a write base.

## Slug discovery and ownership

First determine whether `HEAD` is trunk:

```bash
branch=$(git -C "$WT" symbolic-ref --quiet --short HEAD)
test "$branch" = "<trunk>"
```

On a feature branch, discover candidate Objective slugs from explicit user-supplied slug(s) when present; otherwise use a three-dot diff against trunk:

```bash
git -C "$WT" diff --name-only <trunk>...HEAD -- .asdl/objectives/
```

Reduce paths to `.asdl/objectives/<slug>/`. A slug is genuinely owned by this branch only when this three-dot diff is non-empty for that slug:

```bash
git -C "$WT" diff --quiet <trunk>...HEAD -- .asdl/objectives/<slug>/
```

If no active Objective slug is genuinely owned on a feature branch, report that the branch owns no Objective records and make no commit. If the user supplied explicit slug(s) on a feature branch, still apply the ownership filter and report `not-owned` for any slug that lacks a three-dot Objective diff.

On trunk, there is no ownership diff. Process only explicit active Objective slug(s) or paths supplied by the user or orchestrator. Report `trunk-explicit` for the selection basis, and stop to ask for slug(s) if none are explicit. Never infer trunk refresh targets from branch names, PRs, Objective prose, or a full active Objective scan.

In orchestrated mode on a feature branch, still verify each supplied slug with the same three-dot ownership filter unless the caller explicitly states it already performed that exact filter and supplies evidence in the prompt. In orchestrated mode on trunk, require the caller to supply explicit slug(s) and evidence that it intentionally chose trunk mode.

## Due-check and target preparation

For each owned or explicit slug, prepare the target context that `objective-refresh` needs:

```text
WT=<worktree path>
slug=<active Objective slug>
branch_or_ref=<current branch or HEAD>
trunk_or_base=<trunk/base ref>
selection_basis=<feature-owned|trunk-explicit|orchestrated-owned>
commit_mode=aggregate-by-caller
```

Derive the baseline with the `objective-refresh` rules:

- Feature-owned contexts prefer the most recent `[objective-refresh]` or legacy `[objective-branch-refresh]` commit for that slug; otherwise use `git -C "$WT" merge-base <trunk> HEAD`.
- Feature-owned contexts are due only when `.asdl/objectives/<slug>/` changed since the baseline.
- Trunk-explicit contexts are due for claim verification, but write only when ground truth makes durable prose stale.

After a successful aggregate refresh commit, the last-refresh baseline advances to that commit, so an immediate rerun is a no-op when no claims have drifted. A pure restack with unchanged Objective trees is also a no-op.

## Safety probes

Before processing one Objective directory, verify it is clean:

```bash
git -C "$WT" status --porcelain -- .asdl/objectives/<slug>/
```

- Standalone mode: if a due slug is dirty, stop and report the dirty slug.
- Orchestrated mode: skip that slug, write nothing for it, and include a degrade reason in the report.

Always enforce these invariants:

- Process only Objective directories selected by this branch/context's discovery or explicit slug list.
- Never edit, rewrite, move, delete, normalize, or recreate an existing file under `updates/`.
- Never move, delete, rename, or recreate Objective slug directories.
- Never edit archived Objectives unless the user explicitly asks for archive work.
- Never create `closed.md` and never add `## Closure`.

If a selected Objective appears to require closure rather than refresh, report it as closure-ready/needs `objective-update`; do not close it.

## Per-slug refresh

For each due, clean slug, follow the `objective-refresh` procedure with the prepared target context. `objective-refresh` owns:

- Objective read scope;
- claim ledger construction;
- material-claim verification;
- stale claim correction, narrowing, parking, or `skipped-unverified` classification;
- edits to `objective.md` and `roadmap.md`;
- creation of a new timestamped Semantic Update when meaningful;
- confirmation that existing Semantic Updates, Objective slug directories, and closure markers were not modified.

Keep the branch-level loop responsible for discovery, ownership filtering, dirty-skip behavior, aggregate commit behavior, and the final branch report.

## Commit

After processing all due slugs for this target context, create one self-identifying aggregate commit when there are edits:

```bash
git -C "$WT" add .asdl/objectives/<slug>/
git -C "$WT" commit -m "[objective-branch-refresh] refresh <slug>"
```

For multiple slugs, use a clear plural message such as:

```text
[objective-branch-refresh] refresh Objectives
```

On trunk, include "on trunk" in the message subject when helpful, for example:

```text
[objective-branch-refresh] refresh pr-address-ts-hardening on trunk
```

Do not commit when no slug produced a meaningful edit. Do not create separate nested `objective-refresh` commits when this branch-level orchestrator is aggregating the work.

## Final response

Return a compact report with:

1. Branch/worktree, trunk/base, target SHA/ref, and baseline per processed slug.
2. Per-slug action: `wrote`, `noop-baseline`, `skipped-dirty`, `skipped-ambiguous`, `skipped-unverified`, `closure-ready`, `not-owned`, or `trunk-explicit-noop`.
3. Claim verification summary from `objective-refresh`: key claims verified, key claims corrected/parked/narrowed, and any claims still treated as assumptions/open questions.
4. Durable files edited and any new Semantic Update filenames.
5. Confirmation that no existing Semantic Updates were edited, no Objective slug directories were moved/deleted/recreated, and no Objective was closed.
6. Whether a clean rerun should be a no-op.

## Verify

- New update files, if any, are timestamped and live under the matching Objective's `updates/` directory.
- No existing file under `updates/` changed.
- Required Objective headings remain present in edited files.
- `objective-refresh` was the source of per-objective claim verification and write semantics.
- Negative claims have scoped absence evidence.
- New Semantic Updates include the decisive verification/rebaseline evidence when they correct stale Objective prose.
- No `closed.md` was created and no `## Closure` was added.
- A rerun with no additional Objective changes produces no commit.
