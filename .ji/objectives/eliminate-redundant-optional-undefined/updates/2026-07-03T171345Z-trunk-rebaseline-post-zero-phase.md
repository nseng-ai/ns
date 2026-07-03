# Trunk Rebaseline Into the Post-Zero Phase

## Summary

Verified rebaseline of this record against trunk (`objective-refresh`, no code changes). Findings:

- The 2026-07-01 raw-zero milestone held only briefly: `tools/measure-objective.mjs` at today's trunk reports repo-wide (`ts`) raw optional-undefined count 2 — both `namespace?: string | undefined` request fields in `ts/packages/infra/brmem/src/ref-layout.ts` (`resolveOptionalNamespaceScope`, `resolveRequiredNamespaceScope`) — plus 96 typed explicit-undefined contracts, 0 legacy preserve markers, and 2450 undefined-normalization/check lines. This is the first observed reintroduction and the natural first candidate for the next slice; it was measured, not classified or edited, in this refresh.
- The seed stack PRs #2420, #2423, #2428, and #2429 are confirmed MERGED (all 2026-06-30); the roadmap row now says merged instead of submitted.
- Repository migrations made several record paths stale: the closed predecessor lives at `.ji/objectives/normalize-optional-undefined-boundaries` (not `.sdl/...`); the `sdl-sdk` package's public surfaces now live at `ts/packages/kernel/src/sdk/command.ts` and `execution.ts`; `ExplicitUndefined` lives at `ts/packages/infra/core/src/primitives/primitives.ts` and is imported as `@ji/core/primitives` (package renamed from `@sdl/core`). The `public-api-compatibility` reason survives at all relocated sites. Historical updates keep their original paths; `objective.md`, `roadmap.md`, and `tools/README.md` were corrected.
- `objective.md` and `roadmap.md` were rewritten to encode the phase change: a completed roadmap row records the raw-zero campaign milestone, the durable Definition of Progress now describes the four-metric checked-in measurement instrument (including typed `ExplicitUndefined` contracts as audited surfaces rather than debt), and the runner loop starts from a fresh tool inventory instead of the exhausted pre-zero cluster list (worktree-status, pr-previews, pr-feedback-watch, GitHub PR feedback parser, Roaster/SDK/GitHub residuals).
- `tools/README.md` also gained the missing `public-api-compatibility` entry in its allowed-reason list, matching `ExplicitUndefinedReason` in source.

Typed-contract count drift (101 at the 2026-07-01 update vs 96 now) and normalization-line drift (2301 vs 2450) reflect unrelated repo refactors and growth, consistent with the record's guidance to interpret auxiliary metrics by boundary location rather than as monotonic targets.

Provenance: objective-refresh basis target=5668ac5630b2bab397ef85b9e4cfe4d5cd84c420 from=trunk-HEAD

## Objective Impact

The standing Objective is now explicitly in its post-zero phase: the durable record no longer directs runners at exhausted clusters and instead makes re-inventory-first the default loop entry. The known live inventory is exactly two raw candidates in brmem's ref-layout request shapes. The reintroduction rate (2 within two days of zero) is early evidence for the parked hard-guard consideration but does not itself authorize enforcement.

## Follow-Ups

- Next cleanup slice: classify the two `namespace?: string | undefined` request fields in `ts/packages/infra/brmem/src/ref-layout.ts` (likely omission-only narrowing or a typed contract, pending construction-path evidence); the slice will be legitimately small if the inventory stays this size — record exhaustion evidence rather than padding.
- Keep citing tool invocations with the `.ji/objectives/...` path; the `.sdl/...` form in older updates is historical.
