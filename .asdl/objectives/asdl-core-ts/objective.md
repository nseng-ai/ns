# asdl-core TS Foundation Package

## Thesis

Consolidate the cross-cutting infrastructure duplicated across the four core TS CLI packages (`asdl-dev`, `plans`, `planned-branch`, `pr-address`) into a single new TS workspace package, `asdl-core`. The `pr-address` port exposed four parallel bespoke CLI scaffolds; a follow-up audit found that the same fragmentation runs through every layer beneath the command parser: subprocess execution, git gateways, Result types, machine-output envelopes, boundary validation, exact-duplicate utility files, and scenario-test harnesses.

These gaps nest — each CLI grew its own copies because no shared CLI runtime existed. One foundation package, extracted bottom-up from the proven implementations and adopted by all four CLIs, eliminates the duplication and becomes the concrete realization of the `port-asdl-toolkit-to-typescript` umbrella's "minimal TS migration scaffold" and "internal JS/TS clinkr foundation" roadmap rows. Future capability ports (`brmem`, `handoff`, `objective`, …) then start on the foundation instead of growing a fifth parallel stack.

This Objective is a subobjective of `port-asdl-toolkit-to-typescript`, in the same pattern as `pr-address-typescript-port`.

## Scope

- A new TS workspace package at `ts/packages/asdl-core` holding, as decoupled modules:
  - **Subprocess exec runtime** — unifying `asdl-dev/src/command-runner.ts` and `plans/src/command-runtime.ts` (union of capabilities: AbortSignal, streaming callbacks, configurable timeout/kill-grace, exit-code 124/127 conventions), with `pr-address` gaining timeout support it currently lacks.
  - **Git gateway** — one interface plus real and in-memory implementations, replacing the three-going-on-four parallel gateways; deletes `planned-branch/src/plans-git-adapter.ts` by unifying `sourceBranch`/`currentBranch` naming.
  - **Canonical Result type and clinkr machine envelope** — one discriminated Result shape and the tri-state envelope (`{exit_code: 0|1|2, data?, message?, error_type?}`) as the canonical machine-output contract for all four CLIs, replacing the per-CLI `success: true/false` variants and shared exit-code constants by convention only.
  - **CLI scaffolding framework** — arg/flag parsing (`ParseResult`, `parseFlagValue`, `parseFormat`), help/version handling, entry-point detection (`isDirectCliInvocation`), and error-printing conventions; the original motivator from the `pr-address` port.
  - **Exact-duplicate utilities** — single-sourced `primitives.ts` (`isRecord`, `formatErrorMessage`) and the brmem CLI candidate-resolution logic currently duplicated between `planned-branch/src/brmem-cli.ts` and `pi-extension-runtime/src/brmem-cli.ts` (asdl-core hosts; pi-extension-runtime consumes — pi→core direction is allowed).
  - **Scenario-test harness** — shared `runWithFakes`-style CLI scenario runner, async temp-dir fixture, and node-runtime CLI smoke-test helper (shebang + `--help` via `spawnSync`), exposed via a testing subpath export.
- **Zod boundary validation** across all four core packages: `plans`, `planned-branch`, and `asdl-dev` adopt Zod schemas where they currently hand-roll field extraction (`requiredStringField`, `extractPlannedBranchEvidence`, `validateCheckpointMessage`, session-entry extractors), and `pr-address/src/json-input.ts` generalizes into asdl-core as the shared stdin/file/option JSON loader.
- **asdl-dev public surface**: add `index.ts` and an `exports` field, and migrate `ccc`/`pi-extensions` off deep imports into `asdl-dev/src/*` (15+ files in ccc today).
- Migration of all four core CLIs onto each foundation layer, including updates to in-repo consumers of their machine output (skills, pi extensions through public APIs).

## Non-Goals

- Porting Python `asdl-core` to TypeScript, or any feature work in Python clinkr; the TS package mirrors the *role*, not the codebase.
- npm publishing and released-package distribution mechanics — those stay with the umbrella Objective.
- Refactoring pi-only logic beyond import-path updates (e.g. the `pi-extensions/planned-branch-extension.ts` workflow reimplementation is out of scope).
- Unifying domain-specific fakes beyond the git gateway (per-package vercel/checkpoint/brmem/legacy fakes remain local).
- New user-facing CLI features or contract changes beyond the machine-envelope standardization.
- Backwards compatibility for existing machine-output shapes; this is unreleased software and consumers are in-repo.

## Completion Criteria

- `ts/packages/asdl-core` exists and all four core CLIs consume it for: subprocess exec, git gateway, Result type, machine envelope, CLI scaffolding, and scenario-test harness.
- The known duplicates are gone: byte-identical `primitives.ts` pair, four copies of `isDirectCliInvocation`, duplicated `ParseResult`/parse helpers, the ~220-line `brmem-cli.ts` pair, the quadruplicated node-runtime CLI test, the tripled temp-dir fixture, and `plans-git-adapter.ts`.
- All four CLIs emit the clinkr tri-state envelope for machine-readable output, and every in-repo consumer (skills, planned-branch `machine-envelope` parsing, pi extensions) reads the new shape.
- Boundary validation in `plans`, `planned-branch`, and `asdl-dev` uses Zod schemas rather than hand-rolled extractors.
- `asdl-dev` has a declared public surface and no workspace package deep-imports `asdl-dev/src/*`.
- The umbrella Objective's "minimal TS migration scaffold" and "clinkr foundation" rows reference this record's outcome, and its parked "exact public API shape and package identity for JS/TS clinkr" item is resolved by the shipped package.

## Assumptions and Risks

Assumptions:

- All machine-output consumers of `plans`, `planned-branch`, and `asdl-dev` are in-repo, so the envelope contract can break freely in one slice. If an out-of-repo consumer surfaces, the envelope migration needs a compatibility step.
- The divergent exec-runtime capabilities (AbortSignal in plans, streaming callbacks and kill-grace in asdl-dev) are unionable into one runtime without behavioral regressions for existing callers.
- The four existing CLIs plus the in-flight `pr-address` follow-ups (`pr-address-ts-thermo-review-followups`, which includes a pr-address-internal argv parser and test-scaffolding consolidation) provide enough seam evidence that the foundation APIs are extracted, not invented.
- pnpm / Node ESM / strict TS / Vitest workspace defaults stay stable per the umbrella; config today has zero drift across packages.

Risks:

- **Premature framework.** The umbrella explicitly says to grow a shared framework only as repeated seams become real. Four CLIs is real evidence, but over-generalizing (especially CLI scaffolding) before the next capability port lands could bake in wrong APIs. Mitigation: each layer covers only what the four existing CLIs demonstrably need.
- **New monolith.** asdl-core could accrete into the erk failure mode this repo exists to avoid. Mitigation: decoupled subpath-exported modules with no cross-module reach-through; a CLI can adopt one layer without the others.
- **Pi-side churn.** Envelope changes and the asdl-dev public-surface migration touch `ccc`, `pi-extensions`, and `pi-extension-runtime` (allowed dependency direction, but a wide blast radius: 15+ deep-import files in ccc alone).
- **Name collision.** Python `packages/asdl-core` already exists in this repo; the TS package shares the name by design, but tooling, search, and contributor navigation may conflate them.
- **Coordination with pr-address followups.** The thermo-review followups objective consolidates pr-address-internal parsing/test scaffolding in parallel; sequencing matters so pr-address consolidates onto asdl-core rather than producing a fifth bespoke layer.

## Open Questions

- npm package name: scoped `@asdl/core` (matching `@asdl/plans` et al.) vs unscoped `asdl-core` (matching `asdl-dev`); directory is `ts/packages/asdl-core` either way.
- Whether the testing harness ships as a subpath export (`asdl-core/testing`) or needs a sibling package if production/test dependency separation becomes a problem in practice.
- How much of the clinkr tri-state semantics beyond the envelope (e.g. negative-vs-failure exit-code conventions per operation) should be normative for non-exec, human-facing command output.
