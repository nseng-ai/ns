# Handoff: Explore reconciliation designs less dependent on Git history

Continuation focus: Discuss changes to the Gitplane reconciliation loop that are less dependent on Git history (ancestry proofs, retained cursor commits, complete clones).

## Context

Branch `shallow-ancestry-incomplete-history-classification` (stack over `direct-marker-provenance-cursor-contracts`) implements the plan attached in branch-context: `RealArtifactGateway` no longer converts an unprovable shallow-repo ancestry negative into a definitive `found: false`. That work is done, validated, checkpointed (`62f4acd26`), and submitted as PR #4128 in a 5-PR Graphite stack (#4093, #4100, #4114, #4117, #4128).

The session then turned into a design discussion: the user observed reconciliation will nearly always run in CI (shallow clones by default) and wants to explore reconciliation-loop designs that depend less on Git history, rather than only classifying history unavailability better.

## Current State

Implemented and submitted (do not redo):

- `ts/packages/incubating/infra/gitplane/src/cli/real-artifact-gateway.ts`: reason-bearing `GitFailureClassification` (`missing-object` | `incomplete-history`), single failure-path probe `readRepositoryHistoryCompleteness()` via `git rev-parse --is-shallow-repository`, `isAncestor` exit-1 decision table (complete → `false`; shallow → `incomplete-history`; probe failure/malformed → operational), centralized shallow-aware missing-commit classification in `classifyGitFailure`; `resolveCommit` unknown commitish stays `missing-object`.
- Sanity + integration coverage (real `file://` shallow clone proof) and doc sync in `.ns/objectives/gitplane/references/SPEC-draft.md` (descent-rule paragraph) and `.ns/objectives/gitplane-reconciliation-stack-rebuild/roadmap.md` (source-facts completion guard).
- All gates green: `just`, integration, sanity, isolated, style guard.

Not done / open:

- User has not approved recording the CI-environment assumption or the retryable/terminal reason split as a CLI-slice requirement in the roadmap/spec (was offered, then superseded by this handoff).
- No design change to the reconciliation contract itself; SPEC-draft still requires cursor→target descent for normal reconciliation.

## Decisions / Findings

- Normal reconciliation depends on history in two ways: (1) the descent gate — `isAncestor(cursor, target)`; (2) incremental facts — `diffCommits(cursor, target)` requires the cursor commit retained.
- Ancestry answers are asymmetric: positive = existence proof, valid in any clone; negative = universal claim, only valid with complete history. Hence shallow negatives are now `incomplete-history`, not `false`.
- In default depth-1 CI clones the cursor is usually not even retained, so normal reconciliation fails before the ancestry check (missing required commit → now `incomplete-history` in shallow repos). `incomplete-history` is therefore the routine CI signal, not an edge case.
- Retryable/terminal split is the load-bearing distinction for automation: `incomplete-history` → deepen (`git fetch --deepen` / `--shallow-since`) and retry; `non-forward` → terminal, escalate or run `--full` deliberately. Collapsing them creates unbounded bot retry loops; consumers would reimplement the shallow probe.
- Alternatives already priced out in-session: banning shallow repos (forfeits dominant CI environment; `--full` and retained-window incremental work fine shallow); collapsing the negative everywhere (loses terminal verdict).
- `--full` is ancestry-neutral by design (repair semantics, `repair-performed` events, no history assertion) but reads the complete target corpus and re-emits per-artifact repair events — expensive as a default on large repos.
- Candidate directions for the requested discussion (not yet evaluated): make the materialization store the "prior state" authority so incremental planning diffs target corpus vs stored state instead of cursor vs target Git trees (removes retained-cursor dependency; changes event semantics — v1 spec deliberately avoids target-drift reads); cheap "full-lite" via digest comparison against stored revisions; weakening/eliminating the descent gate in favor of store-side conflict detection (cursor CAS already guards concurrent writers); CI-side fetch contracts (`--shallow-since` last-reconcile) as an operational rather than contract change. Any contract change supersedes spec text this branch just added — record via new decisions, don't rewrite history.

## Next Steps

- Discuss with the user: which history dependencies to relax (descent gate, cursor-diff sourcing, or both) and what replaces them as the correctness authority (materialization store state, content digests, corpus snapshots).
- Evaluate each candidate against the SPEC-draft invariants: truth/validation (no planning from partially materialized rows — store-as-prior-state directly tensions this), event reconstruction semantics, cursor CAS meaning, failure split.
- If a direction is chosen, record it as a superseding decision (SPEC-draft amendment + roadmap note in the gitplane-reconciliation-stack-rebuild objective); do not silently rewrite the conservative-shallow semantics this branch landed.
- Optionally still record the deferred small note: CI is the assumed execution environment; `incomplete-history` vs `non-forward` must stay distinguishable in CLI typed output (roadmap CLI-exposure row).

## Investigation Sources

- Source session ID: 019fd40e-4535-7f3f-998b-3be62347dff3
- Source session log: /Users/schrockn/.pi/agent/sessions/--Users-schrockn-.local-state-ns-slots-repos-ns-worktrees-slot-09--/2026-08-05T22-32-12-853Z_019fd40e-4535-7f3f-998b-3be62347dff3.jsonl
- Related files:
  - .ns/objectives/gitplane/references/SPEC-draft.md — normative reconciliation contract; descent rule (~line 203), invariants, proof matrix; any history-dependence change amends this.
  - .ns/objectives/gitplane-reconciliation-stack-rebuild/roadmap.md — source-facts row with the shallow completion guard added this session; slice ownership for future changes.
  - ts/packages/incubating/infra/gitplane/src/cli/real-artifact-gateway.ts — landed shallow-aware classification; the Gateway whose history dependence is under discussion.
  - ts/packages/incubating/infra/gitplane/src/core/gather-source-facts.ts — maps ancestry facts to HistoryRelationship (ancestor/non-forward/unavailable); where a relaxed gate would change.
  - ts/packages/incubating/infra/gitplane/src/core/gateways.ts — `GitUnavailableReason`, `GitObservation`, `ArtifactGateway` and `MaterializationStoreGateway` contracts (store-as-prior-state ideas live against the latter).
  - ts/packages/incubating/infra/gitplane/test/integration/real-artifact-gateway.test.ts — real shallow-clone proof fixture (file:// depth=2 pattern) reusable for new experiments.
  - Branch Memory `branch-context` namespace, key `shallow-ancestry-incomplete-history-classification.md` on this branch — the executed plan with full provenance and grilling-resolved requirements.

## Useful Commands / Files

- PR: https://github.com/nseng-ai/ns/pull/4128 (stack tip; #4093 → #4100 → #4114 → #4117 below it).
- Focused tests: `pnpm --dir ts exec vitest run --config vitest.sanity.config.ts packages/incubating/infra/gitplane/test/sanity/real-artifact-gateway.test.ts` and `--config vitest.integration.config.ts .../test/integration/real-artifact-gateway.test.ts`.
- Repo gates: `just`, `just ts-test-integration`, `just ts-test-typescript-style-guard`.
- Reload the executed plan if needed: `ns branch-context exec load shallow-ancestry-incomplete-history-classification.md --prompt-file <tmp> --format json`.
