---
name: objective-branch-refresh
description: "Refresh Objective records at a branch tip or explicitly on trunk. Use when asked to refresh a branch's Objectives, bring my branch's Objectives up to date before submitting, replay Objective tracking against the branch tip, refresh an Objective on trunk after landing, or run a non-closing Objective refresh. For closure, use objective-update instead."
---

# objective-branch-refresh

Refresh Objective records at the current tip. This is an Objective skill-family workflow: use/read the `objective` umbrella skill first for shared Objective vocabulary, storage, status semantics, and safety rules.

On feature branches, this skill is autonomous and branch-scoped: it may update multiple Objective records genuinely owned by the branch. On trunk, this skill is an explicit non-closing rebaseline for named Objective slug(s), because trunk has no branch-vs-trunk ownership diff. It never closes Objectives. For any workflow that may create `closed.md`, use `objective-update` instead.

## Concept

A branch refresh asks: if this branch landed now, what should the Objective records touched by this branch say on the default branch?

A trunk refresh asks: now that work has landed on the default branch, what should these explicitly named Objective records say about current ground truth?

Use `objective-update`'s landed-state writing semantics as the authoring model, but apply them without closure behavior. Update durable Objective prose only when tip evidence makes the current record stale, incomplete, or misleading. Do not write ceremonial "checked today" updates.

## Claim verification posture

Be aggressively skeptical. Presume every material Objective claim is false until verified against current ground truth.

A material claim is any durable statement about current or future work that names or implies a concrete fact, including:

- source paths, symbols, commands, packages, workflows, PRs, branches, tests, docs, ADRs, or Objective slugs;
- status words such as "exists", "gone", "current", "already", "now", "still", "remaining", "implemented", "deleted", "covered", "tested", "passing", "legacy", "core", "salvaged", "owned", or "deferred";
- scope boundaries, non-goals, dependencies, risks, assumptions, completion evidence, and roadmap row rationale.

For every material claim that the refresh writes, preserves, or relies on, collect evidence first. Evidence may be repository probes (`test -e`, `find`, `rg`, `git grep`, `git diff`, `git log`), deterministic CLI inventory (`objective exec read-objective`, package help/schema output), or PR/CI evidence when the claim is about PR/CI state. Verify negative claims too: "no X" requires a scoped search showing X is absent.

If a claim cannot be verified cheaply, do not leave it as fact. Convert it to an explicit assumption/open question with the missing-evidence scope, park or narrow the roadmap item, or report `skipped-unverified`. If verified evidence contradicts the Objective, rebaseline the Objective prose/roadmap and add a Semantic Update explaining the correction. Never add a Semantic Update that vouches for unverified draft prose.

## Invocation modes

Use one code path for all modes. Every git operation must use `git -C "$WT"`; never check out another branch as part of this workflow.

- **Feature-branch standalone mode:** `WT` is the current working directory, tip is `HEAD`, and the slug list is discovered from the branch's Objective diff against trunk unless the user supplied explicit slug(s).
- **Trunk standalone mode:** `WT` is the current working directory on trunk, tip is `HEAD`, and the user must supply explicit Objective slug(s) or paths. If no slug is explicit on trunk, stop and ask which active Objective(s) to refresh; do not scan every Objective automatically.
- **Orchestrated mode:** the caller supplies `WT=<slot worktree_path>` and an explicit Objective slug list. This is how `objective-bulk-refresh` applies the primitive to materialized stack tips.

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

## Due-check and idempotency

A feature-branch refresh is due for a slug only when the branch's Objective record changed since this skill's last refresh commit for that slug.

Find the baseline:

```bash
git -C "$WT" log -n1 --format=%H --grep='\[objective-branch-refresh\].*<slug>' -- .asdl/objectives/<slug>/
```

If no matching refresh commit exists on a feature branch, use:

```bash
git -C "$WT" merge-base <trunk> HEAD
```

A feature-branch refresh is due iff this diff is non-empty:

```bash
git -C "$WT" diff --quiet <baseline>..HEAD -- .asdl/objectives/<slug>/
```

A trunk refresh is due whenever an explicit active slug is supplied. Use the last matching refresh commit as the baseline when it exists. If no matching refresh commit exists on trunk, use the most recent commit that touched the Objective directory as the evidence baseline; if the Objective directory exists only at `HEAD`, use `HEAD` as the baseline and record that there is no prior Objective-history baseline. Trunk due-ness means "perform claim verification and write only if ground truth makes durable prose stale," not "force a commit."

After a successful refresh commit, the last-refresh baseline advances to that commit, so an immediate rerun is a no-op when no claims have drifted. A pure restack with unchanged Objective tree is also a no-op.

The Semantic Update provenance line is a human/debug breadcrumb, not the deduplication key:

```text
Provenance: objective-branch-refresh basis tip=<tip-sha> from=<baseline-sha>
```

Do not stamp a post-commit Objective tree SHA into the update file; the update file would be part of the tree being identified.

## Safety probes

Before editing one Objective directory, verify it is clean:

```bash
git -C "$WT" status --porcelain -- .asdl/objectives/<slug>/
```

- Standalone mode: if a due slug is dirty, stop and report the dirty slug.
- Orchestrated mode: skip that slug, write nothing for it, and include a degrade reason in the report.

Always enforce these invariants:

- Edit only one Objective directory at a time.
- Never edit, rewrite, move, delete, normalize, or recreate an existing file under `updates/`.
- Never move, delete, rename, or recreate Objective slug directories.
- Never edit archived Objectives unless the user explicitly asks for archive work.
- Never create `closed.md` and never add `## Closure`.

If a selected Objective appears to require closure rather than refresh, report it as closure-ready/needs `objective-update`; do not close it.

## Write policy

For each due, clean slug:

1. Read the Objective record. Use `objective exec read-objective <slug> --format md` when available for deterministic inventory and closed-marker state, then focus on:
   - `.asdl/objectives/<slug>/objective.md`
   - `.asdl/objectives/<slug>/roadmap.md`
   - recent `updates/` only when needed for context
2. Gather tip evidence from the baseline to `HEAD`:

   ```bash
   git -C "$WT" log --oneline <baseline>..HEAD -- .asdl/objectives/<slug>/
   git -C "$WT" diff --stat <baseline>..HEAD -- .asdl/objectives/<slug>/
   git -C "$WT" diff --name-status <baseline>..HEAD -- .asdl/objectives/<slug>/
   git -C "$WT" diff <baseline>..HEAD -- .asdl/objectives/<slug>/objective.md .asdl/objectives/<slug>/roadmap.md
   ```

3. Build a claim ledger before editing. From changed Objective prose plus any existing prose you are about to preserve, list concrete material claims by category: paths/files, symbols/APIs, commands/CLI surface, tests/evidence, status words, boundaries/non-goals, risks/assumptions, and roadmap rationale.
4. Verify the claim ledger against current ground truth. Use targeted probes rather than vibes:
   - paths/files: `git -C "$WT" ls-files -- <path>`, `test -e`, or `find` scoped to the claimed directory;
   - symbols/commands/types: `rg --fixed-strings`, `rg` with a narrow regex, package `--help`, or schema/help output;
   - "deleted"/"absent"/"no longer": scoped `rg/find/git ls-files` evidence for absence;
   - "implemented"/"covered"/"tested": source plus test probes, and run targeted tests only when the claim depends on passing behavior;
   - PR/CI/review state: `gh`/Graphite evidence when the claim names PR/CI state;
   - branch ownership or deferral: git diff/log/Objective evidence showing the named owner or deferred target exists.
5. Classify each processed slug before writing:
   - `verified`: material claims are supported or have been rewritten into assumptions/open questions.
   - `stale-rebaselined`: at least one claim was false and you corrected/parked/narrowed it.
   - `skipped-unverified`: important claims remain unverifiable or contradictory and you cannot safely rewrite them without user input.
6. Edit `objective.md` when the branch changes durable narrative, scope, completion criteria, assumptions/risks, open questions, closure-adjacent caveats, or when verification shows existing prose is stale. Do not add `## Closure`.
7. Edit `roadmap.md` when ordered guidance, checkbox state, row notes, completion evidence, parked work, or claim verification changes the shape of active work. Use only `[ ]`, `[~]`, and `[x]`.
8. Add one new timestamped Semantic Update under `updates/` when the refresh records a meaningful finding, decision, blocker, risk change, completion event, plan change, follow-up, or ground-truth rebaseline. Include the provenance line above and summarize the verification evidence that mattered.
9. If the due-check says a refresh is due but you cannot identify a meaningful durable change, or cannot verify the Objective claims well enough to trust them, do not invent filler. Report `skipped-ambiguous` or `skipped-unverified` and leave that slug unchanged unless you can safely narrow/park false claims.

## Commit

After processing all due slugs, create one self-identifying commit aggregating this refresh when there are edits:

```bash
git -C "$WT" add .asdl/objectives/<slug>/
git -C "$WT" commit -m "[objective-branch-refresh] refresh <slug> at tip"
```

For multiple slugs, use a clear plural message such as:

```text
[objective-branch-refresh] refresh Objectives at tip
```

On trunk, use the same commit prefix and include "on trunk" in the message subject when helpful, for example:

```text
[objective-branch-refresh] refresh pr-address-ts-hardening on trunk
```

Do not commit when no slug produced a meaningful edit.

## Final response

Return a compact report with:

1. Branch/worktree, trunk, tip SHA, and baseline per processed slug.
2. Per-slug action: `wrote`, `noop-baseline`, `skipped-dirty`, `skipped-ambiguous`, `skipped-unverified`, `closure-ready`, `not-owned`, or `trunk-explicit-noop`.
3. Claim verification summary: key claims verified, key claims corrected/parked/narrowed, and any claims still treated as assumptions/open questions.
4. Durable files edited and any new Semantic Update filenames.
5. Confirmation that no existing Semantic Updates were edited, no Objective slug directories were moved/deleted/recreated, and no Objective was closed.
6. Whether a clean rerun should be a no-op.

## Verify

- New update files, if any, are timestamped and live under the matching Objective's `updates/` directory.
- No existing file under `updates/` changed.
- Required Objective headings remain present in edited files.
- Every material claim written or preserved in edited Objective prose has supporting evidence, has been weakened to an assumption/open question, or caused `skipped-unverified`.
- Negative claims have scoped absence evidence.
- New Semantic Updates include the decisive verification/rebaseline evidence when they correct stale Objective prose.
- No `closed.md` was created and no `## Closure` was added.
- A rerun with no additional Objective changes produces no commit.
