# Implementation Landed — Trunk Rebaseline

## Summary

A trunk-style verified rebaseline confirms that every non-empirical Work slice
has landed on trunk and merged, and rebaselines the roadmap evidence from
pre-merge "local branch" framing to merged-PR framing.

Probe-backed verification at trunk HEAD:

- ADR present at `docs/adr/0027-roaster-generation-time-review-convergence.md`
  with the full rejected-alternatives rationale (review compute cache,
  fingerprint publication ledger, Branch Memory origin distribution, hard
  input-level delta scoping). PR #2879 (merged).
- Publish stamping: `src/core/findings-comment.ts` writes a `roaster-state:v1`
  block alongside the existing `<!-- roaster:<key> -->` marker. PR #2880 (merged).
- Prior-findings gathering: `src/core/prior-findings-context.ts` with
  `test/unit/prior-findings-context.test.ts`. PR #2881 (merged); hardened by
  follow-ons #2893, #2895, #2898 (merged).
- Prompt context + anchoring guard: `review-runner-prompt.ts` plus the
  `prior_findings_*` prompt assets (anchoring guard in
  `prior_findings_context.md`); `test/unit/review-runner-prompt.test.ts`.
  PRs #2882 and remediation #2890 (merged).
- CI wiring: `.github/workflows/roaster.yml` passes
  `--prior-findings-pr-number`, computes the base merge-base, and stamps
  reviewed head/merge-base at publish; `permissions:` stays
  `contents: read` / `pull-requests: write`. PR #2883 (merged).
- No-context default preserved: `priorFindingsPrNumber` is `.optional()` in
  `src/operations/cli-operations.ts`, so `ns roaster review run` stays PR-free
  and GitHub-free by default.

## Objective Impact

No checkbox states changed: the six implementation rows remain `[x]` and the
empirical-validation row remains the sole open `[ ]` Work item. `roadmap.md`
was rewritten from scratch to replace unmerged-branch evidence with landed /
merged-PR evidence, and the empirical row's misplaced "checks passed" line —
which read as completion evidence for an unfinished row — was corrected to a
status note.

`objective.md` was left unchanged: its durable thesis, scope, non-goals,
completion criteria, assumptions/risks, and open questions all still match the
as-built system. The Objective is not closure-ready — the empirical Completion
Criteria (no rephrased re-raises on unchanged code; a content-preserving
`gt restack` force-push re-raises nothing; new work still gets full-strength
review) require human-driven real-PR validation with LLM compute and GitHub
writes, which no probe can confirm.

## Follow-Ups

- Human-steered empirical validation on representative PRs remains the only
  path to closure; nothing else in scope is open.
- The local default-fetch open question stays reserved to a human; the default
  remains opt-in.

Provenance: objective-refresh basis target=8fdc6f50661d8df81024bbcce3c722fb7411441d from=trunk-HEAD
