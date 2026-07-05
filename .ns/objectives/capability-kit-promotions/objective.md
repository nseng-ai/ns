# Capability-Kit Promotions

## Thesis

A 2026-07-05 cross-package sweep of the ten capability packages
(`ts/packages/capabilities/*`) against `@nseng-ai/capability-kit` found five
outright reimplementations of surface the kit already exports, plus a ranked
backlog of genuinely neutral mechanics duplicated across two or more packages.
Deleting the duplicates and adopting the existing kit surface keeps the kit the
single home for neutral mechanics and stops the copies from drifting further.
This continues the neutral-consolidation direction of
`ts-cli-core-structural-cleanup` (whose own neutral rows are complete) as a new
finding set, not a reopen.

## Scope

- The five Tier 1 adoption rows in `roadmap.md` `## Work`: retire local copies
  in flow, ccc, objectives, handoffs, and slots in favor of existing
  capability-kit exports, migrating all consumers.
- Exactly two pinned, minimal kit-surface edits required by those rows:
  1. extend kit `git` `statusPaths`/`changedPathsUnder` with an optional
     pathspec filter and a rename-aware variant (objectives row);
  2. add a small raw-text sibling helper beside `deriveSlugWithModel` in kit
     `model-slug`, carrying the same env model override and killed-result
     retry (ccc row).
- Recording the Tier 2/3 promotion candidates from the sweep as Parked rows so
  the backlog survives this session.

## Non-Goals

- Executing any Tier 2 or Tier 3 promotion (new kit modules such as
  content-slug derivation, git operation-marker detection, JSON-input loader,
  GitHub REST comment mechanics, fs gateways). They stay Parked until
  explicitly pulled into Work.
- Deciding the brmem layering question (kit gaining an `@nseng-ai/brmem`
  dependency vs. hosting shared store code in `@nseng-ai/brmem`).
- Kit-export churn beyond the two pinned edits — no rehoming
  `parseJsonUnknown` off `github/`, no moving flow's
  `selectPrDescriptionModelRef` into the kit selector family (both Parked).
- Anything inside boundaries other records own or explicitly parked: flow land
  external-call telemetry (parked by `flow-land-large-stack-performance`), the
  ccc cmux dispatch pipeline (capability-owned per the closed
  `cmux-extension-consolidation` record), branch-context plan-attachment
  (capability-owned per `ts-cli-core-structural-cleanup`), and the reviews
  `RoasterResult` envelope refactor.
- PR submission, pushing, publishing, or any external-system mutation.

## Completion Criteria

- All five `## Work` rows are `[x]` with their duplicate implementations
  deleted, every consumer migrated to the kit surface, and no dual live copies
  remaining.
- The two pinned kit extensions are covered by tests (including fake/testing
  parity where the touched kit module ships fakes).
- Targeted package tests and repo validation (`just`) pass on the delivering
  branches; evidence recorded in roadmap notes or Semantic Updates.
- Parked rows remain recorded; triaging or executing them is not required for
  closure.

## Definition of Progress

Progress is keepable when:

- a `## Work` row's local duplicate is fully deleted, its consumers compile
  and pass tests against the kit surface, and the row is checked off with
  evidence noted;
- a pinned kit extension lands additively (existing kit consumers unaffected)
  with test coverage.

Do not keep changes that:

- leave both the local copy and the kit path live at once (partial
  migrations);
- add, rename, or rehome kit exports beyond the two pinned edits;
- touch code inside the boundaries listed under Non-Goals.

Useful evidence includes: tsgo typecheck, targeted vitest for the touched
packages, and a green `just` run.

## Runner Policy

This Objective is execution-friendly for `objective-next` and
`objective-autorun` under the boundaries below.

- Direct execution is allowed when: implementing a single `## Work` row within
  its pinned design, on a Graphite feature branch (never on `master`).
- Steer or ask first when: a row's pinned design does not fit reality (e.g.
  the kit `git` contract extension proves non-additive, hidden consumers of a
  deleted symbol surface, or the Pi exec-seam wiring in the objectives row
  needs a new adapter); when tempted to make any kit-surface change beyond the
  two pins; or when pulling a Parked row into Work.
- How work may change files and be left: edits land as commits on Graphite
  feature branches via `gt`, one coherent row (or a clean slice of one) per
  checkpoint; the worktree is left clean; no commits on `master`.
- Validation before keeping work: tsgo typecheck plus targeted vitest for
  every touched package, then `just`, all green.
- What will not happen unless explicitly requested: PR submission or update,
  pushing, publishing, GitHub issue/PR mutation, or any external-system write.

## Assumptions and Risks

Assumptions:

- The sweep findings are accurate against `master` at 423bcdce4 (2026-07-05):
  flow `src/submit/text-generation.ts` is a verbatim type copy with three
  importers; ccc `src/cmux/branch-slug.ts` duplicates kit
  `buildSlugModelArgs` flag-for-flag; handoffs `src/pi/branch-resolution.ts`
  re-derives what `GitGateway.currentBranch` models and `api-context.ts`
  already builds a `RealGitGateway`; slots `src/core/json.ts` duplicates kit
  `parseJsonUnknown`. If any file has moved or been fixed since, re-verify
  before executing that row.
- The kit `git` contract extension (pathspec filter, rename-aware changed
  paths) can be made additively without breaking the ten existing capability
  consumers of `capability-kit/git`.
- ccc's plan-summary path genuinely needs raw multi-line model output, so the
  kit needs the raw-text sibling rather than reusing slug-normalizing
  `deriveSlugWithModel` directly.

Risks:

- Porcelain-parser consolidation risk (objectives row): the kit parses
  NUL-delimited `-z` records; the objective picker's behavior deltas —
  `-- .ns/objectives` path scoping, `-M` rename detection collecting both old
  and new paths, and advisory swallow-errors semantics returning `[]` — must
  be preserved or the picker silently degrades.
- The objectives Pi selection flow runs over the extension `exec` seam, not a
  constructed `GitGateway`; wiring `RealGitGateway` over that seam is
  unverified and may need adapter work (a steer-first trigger, not a license
  to widen scope).
- Kit `parseJsonUnknown` lives under `github/graphql-json`; consuming it from
  non-GitHub slots code is semantically odd. Accepted for Tier 1; the rehome
  is Parked so this risk is deliberate, not overlooked.
- Deleting flow's local text-generation types could miss a consumer if new
  imports landed after the sweep; the migration must be grep-verified at
  execution time.

## Open Questions

- Where does shared brmem-backed store code live: the kit (gaining an
  `@nseng-ai/brmem` dependency) or `@nseng-ai/brmem` itself? Gates the parked
  handoffs/branch-context artifact-store consolidation and shared context
  factory.
- Which parked pure helpers belong in `@nseng-ai/foundation` rather than the
  kit under ADR 0018's four-bucket classification (e.g. path-segment
  sanitizer, `relativeTime`, failure-catalog)?
- Should flow's `selectPrDescriptionModelRef` eventually join the kit's
  `select*ModelRef` family, and should `parseJsonUnknown` be rehomed to a
  neutral subpath? Both parked pending a deliberate kit-surface decision.
