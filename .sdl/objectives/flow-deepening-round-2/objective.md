# Flow Deepening — Round 2

Successor to the closed `flow-capability-deepening` Objective. Driven by the
2026-07-01 architecture review of `ts/packages/capabilities/flow`
(the full report is preserved verbatim at `architecture-review.html` in this
directory — open it in a browser for the before/after diagrams).

## Thesis

Several **shallow** structures in the Flow capability force readers to bounce
across many small modules to understand one concept, and one of them hides a
latent correctness bug. Turning three of these into **deep** modules — a single
Graphite command channel, a single home per autobranch failure, and a single
PR-description update path — concentrates complexity behind narrow interfaces,
improves **locality**, and makes the real sequencing risks testable through one
**interface** instead of behind four wrapping layers.

This round commits only the three `Strong` candidates from the review. The four
`Worth exploring` candidates are recorded under Parked so a later slice (or a
follow-up Objective) can pick them up without re-running discovery.

## Scope

Three deepenings, each self-contained within the Flow capability:

1. **Collapse the Graphite command channel.** One `gt` mutation currently
   crosses four wrapping files (`land-stack/command-exec.ts`,
   `command-stream.ts`, `graphite-command-args.ts`, `graphite-metadata-command.ts`)
   and two orthogonal normalize layers, and callers thread three `pi` variants
   (`extensionApi` / `streamedApi` / `unstreamedPi`) by hand with no type guard.
   Introduce one deep channel module that owns streamed-vs-raw, normalization,
   and arg-building internally, exposing one `run(spec)` **interface** with two
   **adapters** (real `gt` runner in production, scripted channel in tests).

2. **Give each autobranch failure one home.** Each failure is spread across its
   union arm (`latest-commit-transaction.ts` / `latest-commit-preparation.ts`),
   a `classify` case, and a `format` case in `latest-commit-formatting.ts`; the
   twin `dirty-*` and `latest-commit-*` transactions are organized on different
   principles. Co-locate each failure's verdict and message with its arm, and
   give both flows the same prepare→transact→catalog shape. Move
   `AutobranchFlowOutcome` / `AutobranchFlowResult` out of `dirty-worktree.ts`
   so the shared contract stops living in one flow's largest file.

3. **One PR-description update path.** `shared/pr-description.ts`
   (`prepareRegeneratedPrDescription`) and
   `submit/pr-description-orchestration.ts` (`orchestratePrDescription`) run the
   same resolve→generate→edit dance, but only the submit path honors the
   managed-region fingerprint — the regenerate path can overwrite an
   already-current body. Fold both into one update module whose interface takes
   the fingerprint policy; delete the duplicate.

## Non-Goals

- Candidates #4–#7 from the review (sdl-land round trip, land presentation
  surface, forwarder-shim deletion, submit gateway de-leak) — recorded under
  Parked, not in scope for this round.
- Any change to the **Flow Capability API** (`sdl-flow/api`) surface consumed by
  CCC. These deepenings are internal; existing exports must keep working.
- The `sdl-land` extraction / **Flow Land Compatibility Boundary**. Candidate #1
  refactors Flow-internal command execution only and must not disturb the
  compatibility path.
- Behavior changes to any `sdl flow ...` command output beyond fixing the
  PR-description overwrite bug.

## Completion Criteria

- One Graphite command channel module exists; `graphite-maintenance.ts` and the
  land pipeline call it instead of `execGraphite` / `execRawGraphite` /
  `withCommandStreaming` directly, and the `pi` triplet no longer threads
  through the land options bags. Evidence: land scenario + integration tests pass
  driving the scripted channel rather than the outermost `pi.exec`.
- Each autobranch failure's verdict and message live with its arm in one
  catalog; both `dirty-*` and `latest-commit-*` flows share one shape; the shared
  outcome types no longer live in `dirty-worktree.ts`. Evidence: autobranch unit
  and scenario tests pass.
- A single PR-description update module is called by both `regenerate-pr` and
  `submit`; the shared duplicate is deleted; a test demonstrates the regenerate
  path now skips an already-current body (the previously latent overwrite).
- No regression to `sdl-flow/api` consumers (CCC land/submit/autobranch paths).

## Assumptions and Risks

**Assumptions**

- The three deepenings are independent and can land in any order or as separate
  stacked PRs. (If #1 and #3 turn out to share the submit gateway wiring, revisit.)
- No active Objective owns Flow land-stack decomposition; the closed
  `ts-cli-core-structural-cleanup` orientation explicitly routes capability-owned
  land-stack rows to the owning capability context — i.e. an Objective like this
  one. Verified against the open-objective list on 2026-07-01.
- The PR-description fingerprint divergence is a real latent bug, not an
  intentional difference between regenerate and submit. Confirm with a test
  before deleting the shared path.

**Risks**

- **Command-channel blast radius (highest).** Candidate #1 sits on the live land
  path; the streamed-vs-raw distinction exists to avoid double-streaming output.
  A wrong consolidation could double-render or desync the live region. De-risk by
  keeping the scripted-channel test coverage green at every step and landing #1
  as its own reviewable slice.
- **Compatibility-boundary drift.** #1 must not touch the `sdl-land` seam or the
  `sdl-flow/api` exports. Risk is low because the channel is Flow-internal, but
  the land pipeline imports are dense — verify no `LandContext` / `sdl-land`
  import moves.
- **PR-description behavior change is user-visible.** Fixing the overwrite bug
  changes regenerate-pr output in the already-current case. Acceptable (it's the
  intended behavior) but should be called out in the PR description.

## Open Questions

- Does the single Graphite channel belong in `flow/src/land-stack/` or does it
  generalize enough to sit in a neutral Graphite/exec package below Flow? (Lean:
  keep it Flow-internal first; promote only if a second consumer appears — one
  adapter is a hypothetical seam, two is a real one.)
- Should the autobranch failure catalog be shared with the submit failure
  formatting (candidate #7), or kept flow-local? (Defer until #7 is reconsidered.)
