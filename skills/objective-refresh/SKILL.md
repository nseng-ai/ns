---
name: objective-refresh
description: "Refresh exactly one active Objective in one explicit target context without closure. Use when asked to refresh a single Objective for a branch/ref/worktree, rebaseline one Objective after landing, or when branch/repo refresh orchestrators need the per-objective primitive. For user-directed updates or closure, use objective-update."
---

# objective-refresh

Refresh exactly one active Objective record in one explicit target context. This is an Objective skill-family workflow: use/read the `objective` umbrella skill first for shared Objective vocabulary, storage, status semantics, and safety rules.

This skill is the per-Objective primitive for the refresh family. It verifies material claims, updates stale durable Objective prose/roadmap only when meaningful, may append one Semantic Update, and never closes Objectives. For a user-directed update that may create `closed.md`, use `objective-update` instead.

## Concept

A refresh asks: for this target context, what should this Objective record truthfully say as durable ground truth?

On feature branches, an orchestrator may frame the target as "if this branch landed now". On trunk/default branch, the target is an explicit non-closing rebaseline for a named Objective. Use `objective-update`'s landed-state writing semantics as the authoring model, but do not run the Closure Gate, do not create `closed.md`, and do not add `## Closure`.

Do not require the target to be a branch tip. The target may be the current checkout `HEAD`, a branch/ref in a materialized worktree, or an orchestrator-supplied context. What matters is that the worktree/ref, trunk/base, and baseline are explicit enough to gather deterministic evidence.

## Required target context

Process exactly one active Objective slug/path and exactly one target context.

Standalone mode may default the target context to the current checkout `HEAD` only when the checkout is on a real branch:

```bash
git -C "$WT" symbolic-ref --quiet --short HEAD
```

If no slug/path is explicit in standalone mode, run `objective list --minimal --format md` and ask the user to choose one. Do not auto-select from branch name, PR title, roadmap text, changed files, hidden attachments, or candidate count.

Orchestrated mode receives the target context from `objective-branch-refresh` or `objective-repo-refresh`. The caller should provide:

```text
WT=<worktree path>
slug=<active Objective slug>
branch_or_ref=<current branch/ref/HEAD>
trunk_or_base=<trunk/base ref>
baseline=<baseline sha/ref, or instructions to derive it>
selection_basis=<feature-owned|trunk-explicit|orchestrated-owned>
commit_mode=<standalone|aggregate-by-caller>
```

Stop if the selected Objective is archived unless the user explicitly asks for archive work. Stop or ask if target context is not explicit enough to verify claims without guessing.

## Claim verification posture

Be aggressively skeptical. Presume every material Objective claim is false until verified against current ground truth.

A material claim is any durable statement about current or future work that names or implies a concrete fact, including:

- source paths, symbols, commands, packages, workflows, PRs, branches, tests, docs, ADRs, or Objective slugs;
- status words such as "exists", "gone", "current", "already", "now", "still", "remaining", "implemented", "deleted", "covered", "tested", "passing", "legacy", "core", "salvaged", "owned", or "deferred";
- scope boundaries, non-goals, dependencies, risks, assumptions, completion evidence, and roadmap row rationale.

For every material claim that the refresh writes, preserves, or relies on, collect evidence first. Evidence may be repository probes (`test -e`, `find`, `rg`, `git grep`, `git diff`, `git log`), deterministic CLI inventory (`objective exec read-objective`, package help/schema output), or PR/CI evidence when the claim is about PR/CI state. Verify negative claims too: "no X" requires a scoped search showing X is absent.

If a claim cannot be verified cheaply, do not leave it as fact. Convert it to an explicit assumption/open question with the missing-evidence scope, park or narrow the roadmap item, or report `skipped-unverified`. If verified evidence contradicts the Objective, rebaseline the Objective prose/roadmap and add a Semantic Update explaining the correction. Never add a Semantic Update that vouches for unverified draft prose.

## Baseline and due-check

Derive the baseline from the target context and selection basis.

For feature-owned or orchestrated-owned branch contexts, prefer the most recent refresh commit for the slug. Recognize both the current prefix and the legacy branch-refresh prefix so older branches remain idempotent:

```bash
git -C "$WT" log -n1 --format=%H --grep='\[objective-refresh\].*<slug>' -- .asdl/objectives/<slug>/
git -C "$WT" log -n1 --format=%H --grep='\[objective-branch-refresh\].*<slug>' -- .asdl/objectives/<slug>/
```

If no matching refresh commit exists for a feature-owned context, use the merge base with trunk/base:

```bash
git -C "$WT" merge-base <trunk-or-base> HEAD
```

A feature-owned refresh is due iff the Objective directory changed since the baseline:

```bash
git -C "$WT" diff --quiet <baseline>..HEAD -- .asdl/objectives/<slug>/
```

For trunk-explicit contexts, the explicit active slug is due for claim verification. Use the last matching refresh commit when present. If none exists, use the most recent commit that touched the Objective directory; if the Objective directory exists only at `HEAD`, use `HEAD` and record that there is no prior Objective-history baseline. Trunk due-ness means "perform claim verification and write only if ground truth makes durable prose stale," not "force a commit."

The Semantic Update provenance line is a human/debug breadcrumb, not the deduplication key:

```text
Provenance: objective-refresh basis target=<target-sha-or-ref> from=<baseline-sha-or-ref>
```

Do not stamp a post-commit Objective tree SHA into the update file; the update file would be part of the tree being identified.

## Safety probes

Before editing the Objective directory, verify it is clean:

```bash
git -C "$WT" status --porcelain -- .asdl/objectives/<slug>/
```

- Standalone mode: if the selected Objective directory is dirty, stop and report the dirty slug unless the user explicitly asks to incorporate those local edits.
- Orchestrated mode: skip the slug, write nothing for it, and include a degrade reason in the caller's report.

Always enforce these invariants:

- Edit only the selected Objective directory.
- Never edit, rewrite, move, delete, normalize, or recreate an existing file under `updates/`.
- Never move, delete, rename, or recreate Objective slug directories.
- Never edit archived Objectives unless the user explicitly asks for archive work.
- Never create `closed.md` and never add `## Closure`.

If the selected Objective appears to require closure rather than refresh, report it as closure-ready/needs `objective-update`; do not close it.

## Write policy

For a due, clean slug:

1. Read the Objective record. Use `objective exec read-objective <slug> --format md` when available for deterministic inventory and closed-marker state, then focus on:
   - `.asdl/objectives/<slug>/objective.md`
   - `.asdl/objectives/<slug>/roadmap.md`
   - recent `updates/` only when needed for context
2. Gather target evidence from the baseline to the target `HEAD`/ref:

   ```bash
   git -C "$WT" log --oneline <baseline>..<target> -- .asdl/objectives/<slug>/
   git -C "$WT" diff --stat <baseline>..<target> -- .asdl/objectives/<slug>/
   git -C "$WT" diff --name-status <baseline>..<target> -- .asdl/objectives/<slug>/
   git -C "$WT" diff <baseline>..<target> -- .asdl/objectives/<slug>/objective.md .asdl/objectives/<slug>/roadmap.md
   ```

   Use `HEAD` for `<target>` when operating in the current checkout.
3. Build a claim ledger before editing. From changed Objective prose plus any existing prose you are about to preserve, list concrete material claims by category: paths/files, symbols/APIs, commands/CLI surface, tests/evidence, status words, boundaries/non-goals, risks/assumptions, and roadmap rationale.
4. Verify the claim ledger against current ground truth. Use targeted probes rather than vibes:
   - paths/files: `git -C "$WT" ls-files -- <path>`, `test -e`, or `find` scoped to the claimed directory;
   - symbols/commands/types: `rg --fixed-strings`, `rg` with a narrow regex, package `--help`, or schema/help output;
   - "deleted"/"absent"/"no longer": scoped `rg/find/git ls-files` evidence for absence;
   - "implemented"/"covered"/"tested": source plus test probes, and run targeted tests only when the claim depends on passing behavior;
   - PR/CI/review state: `gh`/Graphite evidence when the claim names PR/CI state;
   - ownership or deferral: git diff/log/Objective evidence showing the named owner or deferred target exists.
5. Classify the slug before writing:
   - `verified`: material claims are supported or have been rewritten into assumptions/open questions.
   - `stale-rebaselined`: at least one claim was false and you corrected/parked/narrowed it.
   - `skipped-unverified`: important claims remain unverifiable or contradictory and you cannot safely rewrite them without user input.
6. Edit `objective.md` when the target context changes durable narrative, scope, completion criteria, assumptions/risks, open questions, closure-adjacent caveats, or when verification shows existing prose is stale. Do not add `## Closure`.
7. Edit `roadmap.md` when ordered guidance, checkbox state, row notes, completion evidence, parked work, or claim verification changes the shape of active work. Use only `[ ]`, `[~]`, and `[x]`.
8. Add one new timestamped Semantic Update under `updates/` when the refresh records a meaningful finding, decision, blocker, risk change, completion event, plan change, follow-up, or ground-truth rebaseline. Include the provenance line above and summarize the verification evidence that mattered.
9. If the due-check says a refresh is due but you cannot identify a meaningful durable change, or cannot verify the Objective claims well enough to trust them, do not invent filler. Report `skipped-ambiguous` or `skipped-unverified` and leave the slug unchanged unless you can safely narrow/park false claims.

## Commit behavior

In standalone mode, create one self-identifying commit when there are edits:

```bash
git -C "$WT" add .asdl/objectives/<slug>/
git -C "$WT" commit -m "[objective-refresh] refresh <slug>"
```

Include target context when helpful, for example:

```text
[objective-refresh] refresh pr-address-ts-hardening on trunk
```

In orchestrated mode, do not create a nested commit if the caller will aggregate branch-level edits. Return the files changed and Semantic Update filename so `objective-branch-refresh` can create one aggregate commit for its target context.

Do not commit when the slug produced no meaningful edit.

## Final response

Return a compact report with:

1. Objective slug/path, worktree, branch/ref or `HEAD`, trunk/base, target SHA/ref, and baseline.
2. Action: `wrote`, `noop-baseline`, `skipped-dirty`, `skipped-ambiguous`, `skipped-unverified`, `closure-ready`, or `trunk-explicit-noop`.
3. Claim verification summary: key claims verified, key claims corrected/parked/narrowed, and any claims still treated as assumptions/open questions.
4. Durable files edited and any new Semantic Update filename.
5. Confirmation that no existing Semantic Updates were edited, no Objective slug directories were moved/deleted/recreated, and no Objective was closed.
6. Whether a clean rerun should be a no-op.

## Verify

- New update file, if any, is timestamped and lives under the selected Objective's `updates/` directory.
- No existing file under `updates/` changed.
- Required Objective headings remain present in edited files.
- Every material claim written or preserved in edited Objective prose has supporting evidence, has been weakened to an assumption/open question, or caused `skipped-unverified`.
- Negative claims have scoped absence evidence.
- New Semantic Updates include the decisive verification/rebaseline evidence when they correct stale Objective prose.
- No `closed.md` was created and no `## Closure` was added.
- A rerun with no additional Objective changes produces no commit.
