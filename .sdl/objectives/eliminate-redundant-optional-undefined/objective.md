# Eliminate Redundant Optional Undefined

## Thesis

This Objective is the single open tracking record for follow-up work on redundant optional `undefined` in TypeScript declarations.

It continues from the closed `.sdl/objectives/normalize-optional-undefined-boundaries` Objective. The closed Objective established the semantic process: inventory before editing, normalize loose inputs at boundaries, preserve compatibility surfaces deliberately, avoid regex-driven sweeps, and summarize before/after counts and rationale for every slice.

The follow-up goal is to remove `?: T | undefined` only where the current slice can make and validate a semantic claim. It is not a blanket zero-count campaign. The current branch already carries an in-flight continuation slice around packagechk metadata helpers, GitHub PR feedback fingerprint/status helpers, local preview/check models, pr-feedback-watch models, and worktree-status presentation/internal cleanup; that work is now tracked here instead of reopening or further expanding the closed Objective.

## Scope

In scope:

- Keep one open Objective for redundant optional-undefined follow-up work.
- Continue branch-local cleanup already in flight on `eliminate-optional-undefined-five-pr-stack`:
  - `ts/packages/tools/packagechk/src`
  - `ts/packages/infra/github/src/pr-feedback` and nearby PR status helpers
  - `ts/packages/local-pi-tools/pr-feedback-watch/src`
  - `ts/packages/local-pi-tools/pr-previews/src`
  - `ts/packages/worktree-status/src`
  - related helper tests when production/internal model changes require them
- Use the closed normalization Objective as precedent and process source.
- For each cleanup slice, classify candidates before editing and remove explicit `undefined` only when present-key `undefined` has no domain, compatibility, or external-conformance meaning.
- Normalize producers/builders/parsers before narrowing internal result, diagnostic, presentation, or durable-record shapes.
- Preserve `null` where it carries external or domain meaning while dropping only redundant explicit `undefined` when justified.
- Record before/after scoped counts, fields changed, semantic claims, preserved/deferred categories, and validation evidence.

## Non-Goals

- Do not reopen the closed `normalize-optional-undefined-boundaries` Objective; it remains historical precedent.
- Do not create competing open Objectives for the same optional-undefined follow-up.
- Do not adopt a hard repo-wide ban, checked-in allowlist, or zero-count target in this Objective.
- Do not perform a broad package-wide or repo-wide mechanical rewrite just to reduce grep counts.
- Do not tighten public SDK/kernel, CLI option, dependency bag, external payload mirror, environment/process, Zod input, or fixture/fake-builder surfaces unless a separate normalized internal type or explicit semantic claim justifies it.
- Do not collapse meaningful `null`, omission, and explicit-undefined distinctions accidentally.
- Do not add unrelated address, branch-context, handoff, objective, or roaster slices to the current branch unless they directly connect to the existing in-flight cleanup.

## Completion Criteria

- Exactly one active open Objective record exists for redundant optional-undefined follow-up work in this checkout.
- The current branch's in-flight cleanup slice is completed or explicitly narrowed with rationale.
- Scoped before/after candidate counts are recorded for touched clusters.
- Removed `| undefined` occurrences have documented semantic claims; preserved/deferred candidates are categorized.
- Relevant TypeScript validation passes for the touched scope.
- Remaining optional-undefined candidates in the touched clusters are compatibility/input/external/test-builder/null-sensitive/deferred cases rather than known accidental internal model leaks.

## Assumptions and Risks

Assumptions:

- The closed normalization Objective's conservative process remains the right default for this repository.
- The current branch's existing diff is best treated as one continuation/remediation slice, not as the base of a new five-PR stack.
- Some remaining candidates are legitimate option/input/deps/config or external mirror surfaces and should remain until a local semantic claim is available.

Risks:

- A second open Objective or a divergent hard-enforcement Objective would confuse agents about whether this is a semantic cleanup campaign or a zero-count ban.
- Tightening options/deps/external surfaces mechanically can create review noise and compatibility churn.
- Editing interfaces before producers can push `exactOptionalPropertyTypes` fallout across unrelated callsites.
- Null-sensitive cases can lose meaning if `null`, omission, and explicit `undefined` are collapsed without tracing consumers.

## Open Questions

- Whether any future objective should separately pursue a hard guard/allowlist policy. That is explicitly outside this Objective unless approved as a new scope decision.
- Whether the current branch-local slice should be split before review if packagechk, PR feedback, previews, and worktree-status prove too loosely related.
