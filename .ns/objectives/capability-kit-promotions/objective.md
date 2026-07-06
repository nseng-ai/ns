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
- Second wave (deliberately pulled from Parked 2026-07-05, after all Tier 1
  rows completed): three Tier 2 promotion rows, each retiring duplicate
  implementations in favor of a kit surface and migrating all named
  consumers —
  1. extend kit `git` with operation-in-progress/worktree-admin detection,
     replacing triplicate code in slots, flow, and hosts/pi;
  2. promote the content-slug derivation layer beside kit `model-slug`, with
     plans' generalized shape as the basis and handoffs collapsing to a
     variant;
  3. extract GitHub REST comment mechanics from reviews into a kit `github`
     subpath with real/fake parity, migrating pi-tools pr-feedback-watch as
     the second consumer.
- Third wave (deliberately pulled from Parked 2026-07-05): promote the
  JSON-input loader to `@nseng-ai/capability-kit/json-input`, migrate
  pr-feedback consumers, and migrate reviews JSON parsing sites that cleanly
  fit the new source-loading or parse-only helpers.

## Non-Goals

- Executing any promotion still in Parked (e.g. git output classification,
  result-typed fs gateway, PR-link parsing, shell-install factory, all Tier 3
  rows). Parked rows stay parked until explicitly pulled into Work; the
  2026-07-05 second-wave pull covers exactly the three rows named in Scope,
  and the third-wave pull covers only the JSON-input row.
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

- All `## Work` rows — the five Tier 1 rows (complete), the three
  second-wave rows, and the JSON-input third-wave row — are `[x]` with their
  duplicate implementations deleted, every consumer migrated to the kit
  surface, and no dual live copies remaining.
- The pinned kit extensions (Tier 1's two edits, complete), the three
  second-wave kit surfaces, and the JSON-input kit surface are covered by
  tests (including fake/testing parity where the touched kit module ships
  fakes; the `github` comment mechanics must ship real + fake together).
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
- add, rename, or rehome kit exports beyond the pinned edits and the three
  second-wave surfaces named in Scope;
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

Second-wave assumptions (verified by export-surface inspection 2026-07-05 on
the delivering branch stack):

- The three operation-detection sites are congruent enough for one kit
  module. Verified while delivering
  `kit-git-worktree-state-consolidation`: the taxonomy held with named
  divergences resolved by steering — slots' rebase head-name recovery
  generalized into kit, flow deliberately adopted kit's full union including
  bisect refusal, and hosts/pi proved to have only admin-dir resolution (not
  marker detection) and therefore adopted only that half.
- `plans/src/content-slug-derivation.ts` already models the generalized
  shape (`ContentSlugDerivationVariant` exists); handoffs'
  `content-slug.ts` is a near-parallel copy that can collapse to a variant
  config.
- Reviews' `RoasterGitHubGateway` mechanics (paginated reads, inline-review
  create, discussion POST/PATCH, marker-based sticky upsert) can be extracted
  without absorbing Roaster-specific result envelopes.

Second-wave risks:

- The reviews gateway ships a substantial fake
  (`FakeRoasterGitHubGateway`); extraction must move real and fake together
  or test parity silently breaks.
- `hosts/pi/worktree-status` runs over the Pi exec seam, the same wiring
  risk the Tier 1 objectives row carried (steer-first trigger, not a license
  to widen scope).
- Kit `github` currently hosts `graphql-json`; adding REST comment mechanics
  widens that subpath's charter — accepted deliberately, and the
  `parseJsonUnknown` rehome stays Parked.

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

## Closure

Closed as completed. All `## Work` rows are `[x]`: the five Tier 1 duplicate
adoptions, the three deliberately pulled second-wave Tier 2 promotions, and
the JSON-input third-wave promotion all landed with their local duplicates
deleted, consumers migrated to capability-kit surfaces, and evidence recorded
in `roadmap.md` plus Semantic Updates.

Key delivered kit surfaces and extensions:

- Existing kit text-generation, git, model-slug, GitGateway, and JSON parsing
  surfaces now cover the Tier 1 local duplicates in flow, ccc, objectives,
  handoffs, and slots.
- Kit `git` now covers worktree/admin-dir and operation-in-progress mechanics
  used by slots, flow, and hosts/pi, with consumer-specific wording kept local.
- Kit `content-slug` now owns shared content-slug derivation mechanics while
  plans and handoffs retain their package-specific wrapper/validation wording.
- Kit `github/pr-feedback` now owns reusable GitHub REST PR feedback/comment
  mechanics with fake support, while reviews retains Roaster envelopes and
  pi-tools retains watch/UI behavior.
- Kit `json-input` now owns one-of source loading plus parse/validation helpers
  used by pr-feedback and the cleanly fitting reviews sites.

Validation evidence is captured in the row notes and updates, including targeted
package tests, `pnpm --dir ts run check`, lint/format checks where relevant,
`just ts-test-typescript-style-guard` for style-sensitive slices, and green
`just` runs on the delivering branches. No remaining Work row is open, and the
Completion Criteria explicitly require only that Parked rows remain recorded,
not that they be triaged or executed.

Remaining follow-ups are intentionally parked future scope: git output
classification, PR-link parsing, result-typed fs gateway, shell-install helper,
small helper placement decisions, brmem/artifact-store layering, payload store
placement, PR-address seam decisions, Pi parsing placement, deferred kit-surface
tidies, and slots/flow worktree coupling. Pull any of those into Work only via a
new explicit Objective update or future Objective.
