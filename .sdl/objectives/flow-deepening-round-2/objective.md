# Flow Deepening — Round 2: Deep Interfaces and Land Domain Extraction

Successor to the closed `flow-capability-deepening` Objective, driven by the
2026-07-01 architecture review of `ts/packages/capabilities/flow` (preserved
verbatim at `architecture-review.html`; diagrams need a browser). Restructured
in place on 2026-07-02 after a depth audit — see
`updates/2026-07-02T150856Z-depth-audit-and-restructure.md` for the audit
findings and decisions this rewrite encodes.

## Thesis

Round 2 originally committed the review's three `Strong` candidates. They
landed, but the depth audit showed they delivered **consolidation and
co-location** more than **interface depth**: the Graphite channel merged four
wrapper files yet kept an argv-shaped, four-method interface with caller-side
arg-building; the autobranch failures were co-located but adding one failure
is still three edit sites; only the PR-description slice produced a genuinely
deep module (one small interface, two callers, one bug fixed once).

The audit also surfaced the generator behind the symptoms: **the half-finished
land migration**. Flow's land execution still runs beside the Land Domain Core
(`flow/src/land/`) instead of on it, so every stack operation crosses the Flow
Land Compatibility Boundary through mirror types, duplicate `type↔kind`
mappers, and duplicated label heuristics — a standing wrapper factory that
successive deepening rounds keep paying interest on. `flow/CONTEXT.md` already
records the target shape (Flow Stack Preflight Adapter, Land Gateway Set); the
code has simply never converged to it.

This Objective therefore now has two jobs, in one record:

1. **Finish the interfaces round 2 started** — operation-shape the channel,
   give `regenerate-pr --force` real semantics, delete the forwarder shims,
   and build the one-edit-site failure catalogs alongside the submit gateway
   de-leak.
2. **Retire the generator** — migrate land execution onto the Land Domain
   Core's gateways and delete the compatibility round trip, dissolving review
   candidate #4 rather than consolidating it.

## Scope

Six work streams, ordered in `roadmap.md`:

1. **Operation-shape the Graphite command channel.** Fold the seven exported
   arg-builders into operation specs owned by the channel; remove `runRaw`
   from the interface (zero external callers); absorb the caller-side
   `maintenance.kind` method selection; reconcile the generic-runner vs
   bespoke-operation split (`deleteFinalLocalBranch`).
2. **`regenerate-pr --force`, full semantics.** `--force` regenerates a
   fingerprint-current body *and* skips confirmation, matching land's
   `--force`. Decided 2026-07-02; implementation and tests remain.
3. **Delete the forwarder shims** (review #6): the five true single-purpose
   rename/re-export files; `land-stack/graphite-metadata-command.ts` is not a
   pure shim (two source consumers plus a test helper) and folds into the
   channel instead.
4. **Land Domain extraction — inventory, then migration.** Enumerate remaining
   Flow Land Execution behaviors against Land Gateway Set coverage, then move
   execution onto the Land Domain Core in reviewable slices.
5. **Retire the compatibility round trip** (dissolves review #4): delete the
   `LandPlanForFlow` mirror, both `type↔kind` mappers, and the duplicate
   operation-label heuristics; one crossing remains, matching the documented
   Flow Stack Preflight Adapter.
6. **De-leak the submit gateway + one-edit-site failure catalogs** (review #7
   plus the autobranch residual): `SubmitGateway` returns domain results with
   Graphite-stderr classification behind the seam; submit and autobranch share
   one per-failure catalog idiom where adding a failure is one edit site.

## Non-Goals

- Any change to the **Flow Capability API** (`sdl-flow/api`) surface consumed
  by CCC. Existing exports keep working through every slice, including the
  extraction.
- The land presentation surface (review #5) until the extraction lands — see
  Parked in `roadmap.md`.
- Promoting the Graphite channel to a neutral package below Flow. Revisit only
  when a second real consumer appears.
- Building a scripted-channel test adapter. Scripted `pi.exec` is the
  canonical land test seam (decided 2026-07-02); the channel seam makes no
  substitutability claim.
- Rewriting historical `updates/` files; corrections append.

## Completion Criteria

Depth is measured at the interface. Each criterion is a checkable fact about
what a caller must know, not about module existence.

- **Channel:** adding a new `gt` mutation to the land path requires a new
  operation spec only — no new channel method, no caller-side arg builder, no
  wrapper file. `runRaw` is gone from the interface; no caller branches to
  select a channel method; streamed-vs-raw is not caller-visible vocabulary.
  Land scenario tests still script `pi.exec` and assert emitted argv.
- **Regenerate:** `sdl flow regenerate-pr --force` regenerates a
  fingerprint-current managed region without prompting; the default path still
  skips when current and still confirms; the no-op compatibility sentence and
  notice are deleted. A scenario test covers both paths.
- **Shims:** the five forwarder files are deleted with imports pointed at the
  real interfaces; `shared/text-generation.ts` (many consumers) survives
  explicitly; `graphite-metadata-command.ts` is absorbed by the channel.
- **Extraction:** land execution behaviors enumerated in the inventory run on
  the Land Domain Core's four gateways (`land/types.ts` `LandContext`); no
  behavior is orchestrated twice (once in `land-stack/`, once in `land/`).
- **Round trip:** `plan-mapping.ts`'s mirror types and both mappers are
  deleted; one label heuristic exists; Flow crosses into `sdl-flow/land` at
  exactly one adapter module. `sdl-flow/api` exports are unchanged.
- **Submit/catalog:** `SubmitGateway` returns domain results (no Graphite
  stderr taxonomy on the interface); submit orchestration is testable without
  stderr fixtures; adding one failure — submit or autobranch — is one edit
  site in one catalog entry, exhaustive by type.
- **Closure gate:** the Parked row (#5) is promoted, re-scoped, or explicitly
  dropped with rationale in closure prose before `closed.md` is written; full
  TS validation (`just` entrypoint) is green on the final state.

## Definition of Progress

Progress is keepable when:

- Exactly one roadmap row (or one explicitly named slice of the extraction
  migration row) advanced, on a feature branch created with `gt`, never on
  `master`.
- The full TS validation suite passes: `just ts-format-check`, `just ts-lint`,
  `just ts-check`, `just ts-test`, `just ts-test-integration`,
  `just ts-deps-check` (or the `just` default entrypoint covering them).
- `sdl-flow/api` exports are untouched, or the diff proves compatibility.
- The row's `Evidence:` expectation is demonstrated by a named test, and a
  Semantic Update records what landed and any premise changes to later rows.

Do not keep changes that:

- Leave a behavior orchestrated in both `land-stack/` and `land/` without a
  roadmap note saying which slice removes the duplication.
- Add wrappers, mirror types, or mappers at the Flow Land Compatibility
  Boundary.
- Change `sdl flow` command output beyond the `--force` semantics this record
  specifies.
- Edit historical `updates/` files.

Useful evidence includes: the named scenario/unit tests per row, `pnpm --dir
ts --filter sdl-flow test` output, and grep-level facts the row states (e.g.
zero `runRaw` references, zero `LandPlanForFlow` references).

## Runner Policy

This Objective is execution-friendly for `objective-next` under the boundaries
below.

- Direct execution is allowed when: the selected row carries
  `Policy: direct`, its listed preconditions hold, and work proceeds one row
  at a time on a `gt`-created feature branch.
- Steer or ask first when: the row carries `Policy: preview` (extraction
  migration slices), the row's stated premise no longer matches the code, a
  change would touch `sdl-flow/api`, `LandContext` gateway signatures beyond
  the row's stated scope, or anything under `ccc/`.
- How work may change files and be left: code edits within
  `ts/packages/capabilities/flow` (tests included), plus this Objective's
  record files; work is left committed on its feature branch with a Semantic
  Update appended. Roadmap checkboxes flip only with passing validation named
  in the row.
- Validation before keeping work: the Definition of Progress suite, plus the
  row's named tests.
- What will not happen unless explicitly requested: submitting or updating
  PRs, mutating GitHub, closing or archiving this Objective, editing
  `flow/CONTEXT.md`, touching packages outside `flow`, or landing anything on
  `master`.

## Assumptions and Risks

**Assumptions**

- The Land Domain Core (`flow/src/land/`) and its four-gateway `LandContext`
  are the intended destination for land execution, per `flow/CONTEXT.md`
  (Flow Land Execution, Land Domain Core, Land Gateway Set, Flow Stack
  Preflight Adapter). Verified against CONTEXT.md 2026-07-02.
- No other active Objective owns the land extraction (verified against the
  open-objective list 2026-07-01; re-verified 2026-07-02 — this Objective now
  owns it).
- The channel, `--force`, shims, and submit/catalog rows are independent of
  the extraction and can interleave with it.
- Round-2's three delivered slices remain accepted as landed; corrections are
  to evidence wording and residuals, not to the shipped code's validity.

**Risks**

- **Extraction blast radius (highest).** Land is the live merge path. Mitigate
  by the inventory-first row (no code moves), `Policy: preview` on migration
  slices, one behavior per slice, and scenario tests scripting `pi.exec`
  staying green throughout.
- **Compatibility-boundary drift during migration.** Until the round trip
  retires, partial migration can duplicate orchestration. The Definition of
  Progress forbids leaving duplication unrecorded.
- **`--force` confirmation bypass.** Skipping confirmation on a GitHub-editing
  command re-litigates a past decision (the flag was deliberately neutered).
  Mitigate: implementation checks confirmation danger-tier conventions first;
  blast radius is limited to the SDL-managed region, which regeneration can
  restore.
- **Channel seam misread.** The record previously claimed a scripted-channel
  test seam that never existed. Until `orientation.md`'s note ages out, agents
  may still design against a substitutable channel. The orientation file and
  the channel row both state the canonical seam to prevent this.

## Open Questions

- Does the Land Domain Core stay a `sdl-flow` subpackage after the migration,
  or graduate to its own package? Decide during the extraction; graduation is
  out of scope for this record unless a second consumer appears.
- Channel promotion trigger: if submit's Graphite calls migrate onto the
  channel (plausible during row 6), does the channel then justify a real
  substitution seam and a neutral home? Revisit at that row, not before.
- What does the land presentation surface (#5) look like after extraction —
  still three files split by mechanism, or does the migration collapse part of
  it for free? Re-inventory at promotion time; its parked premise is already
  partially stale.
