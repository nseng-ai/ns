---
name: objective-refresh
disable-model-invocation: true
description: "Verified rebaseline of active Objective records — refreshes what the current branch or trunk evidences; may close an Objective whose completion is verified; never commits."
---

# objective-refresh

Rebaseline active Objective records against ground truth. Read the `objective` umbrella skill first for shared vocabulary, storage layout, required headings, and Semantic Update rules; this skill does not restate them.

One absolute governs every run:

- **Never commit.** No `git commit`, no staging. Edits stay uncommitted in the worktree and the report says what changed; the user decides how to land it.

Closure is allowed but evidence-gated: when the verified contract shows the Closure Gate is clearly ready — every completion criterion met with probe-backed evidence and no material open work — the refresh closes the Objective inline per `objective-close` semantics (`## Closure` in `objective.md` plus the minimal `closed.md` marker). When completion is plausible but not fully verified, or the outcome/rationale needs a user decision, report `closure-ready` instead of closing.

## Select targets

Selection is mechanical — never ask a scope question:

- **Explicit slug(s) or path(s)** → refresh exactly those. Stop if one is archived unless the user explicitly asked for archive work. On a feature branch, a named slug with no branch evidence is reported `not-owned` rather than silently rebaselined against trunk state — unless the user clearly asked for a trunk-style rebaseline of that slug.
- **No slug, feature branch** → the union of slugs with committed or uncommitted Objective evidence:

  ```bash
  git -C "$WT" diff --name-only <trunk>...HEAD -- .ns/objectives/
  git -C "$WT" status --porcelain -- .ns/objectives/
  ```

  Reduce paths to slugs. Empty union → report that the branch evidences no Objective records and stop without writing.
- **No slug, trunk** → every active open Objective from `ns objective list --names`.

`WT` is the current working directory unless the caller names another worktree. Every git operation uses `git -C "$WT"`; never check out another branch. Stop if `HEAD` is detached (`git -C "$WT" symbolic-ref --quiet --short HEAD` fails). Trunk is `gt trunk` when available, else the repo's configured default branch; if the sources disagree, stop and ask.

**Baseline.** On a feature branch the baseline is `git -C "$WT" merge-base <trunk> HEAD` and the evidence window is `<baseline>..HEAD` plus uncommitted worktree state; a slug is also in scope when the user points at branch changes that contradict its claims. On trunk there is no baseline — verify against `HEAD`. There are no refresh commits and no commit-message markers anywhere: due-ness is content-level, so a record that already matches its verified contract yields no write.

## Refresh loop

Process one slug at a time. The authoring move is a from-scratch rewrite driven by a **contract** — extract, verify, rewrite, diff — never paragraph patching. Frame each slug as: on a feature branch, "if this branch landed now, what should this record say on trunk?"; on trunk, "what should this record say about landed ground truth?". Use `objective-update`'s landed-state writing semantics as the content model.

Uncommitted Objective edits are input, not a stop: worktree content, committed plus uncommitted, is the current record. Note which slugs were already dirty, for the report.

Write invariants, in addition to the never-commit absolute:

- Edit only the selected Objective directories.
- For `updates/`, follow the `objective` umbrella skill's immutable Semantic Update rule: refreshes may add new update files, not change old ones.
- Never move, delete, rename, or recreate an Objective slug directory.
- Never edit archived Objectives unless explicitly asked.

Per slug:

1. **Read the record.** `ns objective exec read-objective <slug> --format md` for deterministic inventory and closed-marker state; read `objective.md`, `roadmap.md`, and recent `updates/` as source material.
2. **Gather evidence** over the window:

   ```bash
   git -C "$WT" log --oneline <baseline>..HEAD -- .ns/objectives/<slug>/
   git -C "$WT" diff <baseline>..HEAD -- .ns/objectives/<slug>/
   git -C "$WT" diff -- .ns/objectives/<slug>/
   ```

   On trunk, skip the range probes and verify against `HEAD` plus worktree state.
3. **Extract the contract**: durable purpose, boundaries, completion criteria, assumptions/risks, open questions; progress (done, active, parked, closure-adjacent, remaining roadmap shape); every material claim by category; and stale or suspect text that must not be carried forward as fact.
4. **Verify the contract** claim by claim, per Verify claims below.
5. **Classify**: `verified` (contract supported, or weakened into assumptions/open questions), `stale-rebaselined` (a false claim was corrected, parked, or narrowed), or `skipped-unverified` (important claims remain unverifiable and unsafe to rewrite without the user).
6. **Rewrite `objective.md` from scratch** when the verified contract changes durable narrative, scope, criteria, assumptions/risks, or open questions, or shows existing prose stale. Never preserve old wording by inertia.
7. **Rewrite `roadmap.md` from scratch** when active work shape changes: ordered guidance, checkbox state (`[ ]`, `[~]`, `[x]` only), row notes, completion evidence, parked work.
8. **Contract-diff.** Compare the rewrite against the extracted contract line by line: every verified purpose, boundary, progress fact, roadmap item, assumption, open question, and parked item is present or intentionally omitted with a stated reason, and the umbrella's required headings survive. Dropped or softened meaning is a bug — fix it before moving on.
9. **Re-derive `orientation.md`** when one exists, per the umbrella's re-derivation rule; add one when the verified contract shows the Objective became orienting (its direction now binds unrelated agents). Never drop one.
10. **Close when verifiably finished.** If the verified contract shows every completion criterion met with probe-backed evidence and no material open work, close inline per `objective-close` semantics: record `## Closure` in `objective.md` (outcome, rationale, closure-relevant PR evidence) and write the minimal `closed.md` marker. The closure evidence goes in the Semantic Update below. If completion is plausible but unverified, or the outcome/rationale needs a user call, report `closure-ready` without closing.
11. **Append at most one timestamped Semantic Update** when the refresh records a meaningful finding, decision, blocker, risk change, completion event, plan change, follow-up, closure, or rebaseline — carrying the decisive evidence and the provenance breadcrumb:

    ```text
    Provenance: objective-refresh basis target=<target-sha-or-ref> from=<merge-base-or-trunk-HEAD>
    ```

    No meaningful durable change, or a contract you cannot trust? No filler: leave the slug unchanged and report `skipped-ambiguous` / `skipped-unverified`.

## Verify claims

Verification is forensic: presume every material claim false until evidence proves it.

Material claims: source paths, symbols, commands, packages, workflows, PRs, branches, tests, docs, ADRs, Objective slugs, status words, scope boundaries, non-goals, dependencies, risks, assumptions, completion evidence, roadmap rationale. Status words include "exists", "gone", "current", "already", "now", "still", "remaining", "implemented", "deleted", "covered", "tested", "passing", "legacy", "core", "salvaged", "owned", and "deferred".

Match each claim to a probe:

- paths/files: `git -C "$WT" ls-files`, `test -e`, or `find` scoped to the claimed directory;
- symbols/commands/types: `rg --fixed-strings` or a narrow regex, `--help`/schema output;
- negative claims ("deleted", "no X"): scoped absence evidence — a search showing X is gone;
- "implemented"/"covered"/"tested": source plus test probes; run targeted tests only when the claim depends on passing behavior;
- PR/CI/review state: `gh`/Graphite evidence;
- ownership/deferral: git diff/log/Objective evidence that the named owner or deferred target exists.

PR evidence is a material claim: verify numbers, review/CI status, and merge state before carrying it forward. Write `merged` only when merge state is confirmed; otherwise weaken to status-neutral wording. Keep PR bullets to material Objective PRs per the umbrella convention; do not normalize unrelated historical PR mentions just to satisfy it.

A claim that cannot be verified cheaply never stays as fact: convert it to an explicit assumption/open question with the missing-evidence scope, park or narrow the roadmap item, or classify the slug `skipped-unverified`. When evidence contradicts the record, correct the contract before rewriting and say so in the Semantic Update. Never let a Semantic Update vouch for unverified prose.

## Report

Return a compact report: worktree, branch, trunk, target SHA; per slug — baseline, action (`wrote`, `closed`, `noop`, `skipped-ambiguous`, `skipped-unverified`, `closure-ready`, `not-owned`), key claims verified/corrected/still-assumed, files edited and new Semantic Update filenames; slugs that were already dirty; confirmation that the never-commit absolute and all write invariants held, and that any closure was backed by verified completion evidence.

Done when an immediate rerun would modify nothing — every refreshed record already matches its verified contract.
