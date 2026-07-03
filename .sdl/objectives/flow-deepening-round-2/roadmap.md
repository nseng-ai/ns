# Roadmap

Candidate numbers refer to the 2026-07-01 review at `architecture-review.html`
(diagrams need a browser; each row below is self-contained for execution).
Restructured 2026-07-02 — see
`updates/2026-07-02T150856Z-depth-audit-and-restructure.md` for why rows
changed. All paths are relative to `ts/packages/capabilities/flow/` unless
stated. Validation baseline for every row: the Definition of Progress suite in
`objective.md`.

## Work

- [x] Collapse the Graphite command channel (review #1)
      Delivered 2026-07-01: wrapper cluster (`command-exec.ts`,
      `graphite-command-args.ts`) collapsed into
      `src/land-stack/graphite-command-channel.ts`; `pi` triplet removed via
      `land-runtime.ts`; normalization single-layer; special cases named.
      Evidence correction (2026-07-02 depth audit): scenario tests script
      `pi.exec` (`test/unit/land-stack-command-scenarios.test.ts`) — that is
      the canonical seam; no scripted-channel adapter exists or is planned.
      Interface depth deferred to the operation-shaping row below.
- [x] Give each autobranch failure one home (review #2)
      Delivered 2026-07-01: shared result types moved to
      `src/autobranch/flow-result.ts`; classify/format switches co-located
      with their arms; central formatting file deleted.
      Evidence correction (2026-07-02 depth audit): co-location landed, but
      adding a failure is still three edit sites (arm, classify case, format
      case). The one-edit-site catalog is folded into the submit/catalog row
      below.
- [x] Unify the PR-description update path and close the fingerprint overwrite bug (review #3)
      Delivered 2026-07-01 as specified: one update module
      (`src/submit/pr-description-orchestration.ts`), duplicate deleted,
      regenerate skips an already-current body with a scenario regression.
      Residual: `--force` semantics, next rows.
- [x] Operation-shape the Graphite command channel
      Delivered 2026-07-02 (runner step, commit `2163da469` on
      `flow-operation-shaped-graphite-channel`): the channel owns operation
      specs; the seven exported arg-builders and `formatGraphiteCommand`
      pairing are folded in; `runRaw` removed from the interface; the
      `maintenance.kind === "optional-descendant"` method selection absorbed;
      `deleteFinalLocalBranch` reconciled with the spec shape;
      `graphite-metadata-command.ts` deleted into the channel (the shims
      row's fold-in, done here as planned).
      Evidence: grep shows zero `runRaw` and zero arg-builder references in
      flow src/test; land scenario tests pass with unchanged `pi.exec` argv
      assertions (`land-stack-command-scenarios.test.ts` untouched); a unit
      test demonstrates a new mutation needs only a spec entry; full DoP
      suite reported green by the step, independently re-verified via flow
      package tests (47 files / 419 tests) and `just ts-check`.
- [x] Give `regenerate-pr --force` full force semantics (decided 2026-07-02)
      Delivered 2026-07-02 (runner step, commit `bbdd2b5f7` on
      `flow-regenerate-pr-force-semantics`): `--force`/`-f` passes
      `fingerprintPolicy: "force"` and suppresses the confirmation step;
      the no-op compatibility sentence and notice branch are deleted.
      Precondition held: ADR 0014 (`docs/adr/0014-clinkr-confirmation-danger-tiers.md`)
      standardizes `--force`/`-f` as the non-interactive authorization that
      relaxes confirmation, matching land's `--force` — the bypass is the
      sanctioned convention, not a violation (the archived Objective record
      is gone; the ADR is the durable home of the conventions).
      Evidence: `test/scenario/regenerate-pr-command.test.ts` covers force
      regenerating a fingerprint-current body without prompting, default
      no-op on current, and default prompt on stale; full DoP suite reported
      green by the step, independently re-verified via flow package tests
      (47 files / 419 tests) and `just ts-check`.
- [x] Delete the forwarder shims (review #6)
      Delivered 2026-07-02 (runner step, commit `67c6e49ee` on
      `flow-delete-forwarder-shims`): the five forwarder files
      (`shared/git.ts`, `shared/text-helpers.ts`,
      `shared/checkpoint-message.ts`, `submit/format.ts`,
      `autobranch/short-sha.ts`) are deleted with callers pointed at the
      real interfaces; no replacement re-export added;
      `shared/text-generation.ts` survives as the real naming seam;
      `graphite-metadata-command.ts` had already been absorbed by the
      channel row.
      Evidence: parent-verified — files absent, only remaining path
      reference is a negative regression assertion in
      `extension-shared-flow-foundations.test.ts`; flow suite passes
      (44 files / 413 tests) and `just ts-check` green; full DoP suite
      reported green by the step.
- [x] Land Domain extraction — inventory (no code moves)
      Delivered 2026-07-02 (parent-executed: read-only investigation, no
      runner step needed since the deliverable is a Semantic Update): the
      migration map lives in
      `updates/2026-07-02T174146Z-land-extraction-inventory.md` — 13
      behaviors (B1–B13) classified presentation vs execution with
      method-level gateway gaps, plus a 10-slice migration decomposition
      ordered lowest-risk-first (slice 1: strict merge gate + validator
      dedupe; slice 8 riskiest: post-merge Graphite maintenance).
      Premise corrections it establishes: five boundary crossings exist
      today (not one adapter plus mirror); the `src/land/` directory is
      not the domain boundary (three Flow-execution files live there);
      `LandGraphiteGateway`'s mutation methods are unwired no-op stubs.
      Evidence: the update covers every Flow Land Execution behavior in
      `flow/CONTEXT.md`'s definition; no source files changed
      (parent-verified clean tree after the investigation).
- [ ] Land Domain extraction — migrate execution onto the Land Domain Core
      Policy: preview. Precondition satisfied 2026-07-02: the map is
      `updates/2026-07-02T174146Z-land-extraction-inventory.md` (10 slices,
      lowest-risk-first; start at slice 1). Execute
      one mapped slice at a time, each previewed via `objective-next` before
      code changes.
      What: per the map, move execution behaviors to run on the Land Domain
      Core's `LandContext` gateways, extending gateway interfaces where the
      map says they fall short. Presentation, prompts, and command streaming
      stay Flow-side per the Flow Land Compatibility Boundary. Never leave a
      behavior orchestrated in both `land-stack/` and `land/` without a
      roadmap note naming the slice that removes the duplication.
      Evidence per slice: land scenario tests pass unchanged (argv-level
      `pi.exec` scripting); the migrated behavior has no remaining
      `land-stack/` orchestration copy, or the duplication is noted with its
      removal slice.
- [ ] Retire the compatibility round trip (dissolves review #4)
      Policy: direct once the migration row's slices are landed.
      What: delete the `LandPlanForFlow` mirror and both `type↔kind` mappers
      in `src/land-stack/plan-mapping.ts`; collapse the duplicate
      operation-label heuristics to one; Flow crosses into `sdl-flow/land` at
      exactly one adapter module (the documented Flow Stack Preflight
      Adapter). Round-trip files today: `plan-mapping.ts` (167),
      `landing-plan.ts` (46), `land-context-adapter.ts` (247),
      `pre-merge-submit.ts` (167).
      Guard: `sdl-flow/api` exports unchanged; nothing under `ccc/` imports
      Flow land internals.
      Evidence: grep shows zero `LandPlanForFlow` references; one label
      heuristic; land scenario + integration tests pass.
- [ ] De-leak the submit gateway and build the shared failure catalog (review #7 + autobranch residual)
      Policy: direct. Independent of the extraction; may interleave.
      What: move Graphite-stderr classification (`detectRestackNeeded`,
      `detectTrunkOutOfDate`, and the other regex classifiers in
      `src/submit/submit.ts`, 969 lines) behind `SubmitGateway` so the
      interface returns domain results; co-locate each failure shape with its
      message so branches stop bouncing `submit.ts` ⇄ `submit-format.ts`
      (489 lines, 15 `format*FailureOutput` functions). Establish one
      per-failure catalog idiom — entry = arm + verdict + message, exhaustive
      by type — and apply it to the autobranch switches too
      (`src/autobranch/latest-commit-transaction.ts:328` classify, `:345`
      format, plus the `dirty-transaction.ts` twins), completing the
      one-edit-site goal the co-location slice deferred.
      Evidence: submit orchestration unit-testable without stderr fixtures;
      no Graphite stderr taxonomy in `SubmitGateway`'s interface types;
      adding a failure in submit or autobranch is demonstrably one edit site
      (a unit test adds one catalog entry and nothing else).

## Parked

- [ ] Unify the land presentation surface (review #5)
      Parked behind the extraction: migration changes its inputs, and doing it
      first means doing it twice. Premise correction (2026-07-02): the
      original three-file inventory (`presentation.ts` 519,
      `land-presentation.ts` 132, `command-stream.ts` 250) predates the
      channel absorbing Graphite start/finish streaming — re-inventory before
      starting. Closure gate: this row must be promoted, re-scoped, or
      explicitly dropped with rationale before the Objective closes.
