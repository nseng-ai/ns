# Flow Deepening — Round 2: Deep Interfaces and Land Domain Extraction

Successor to the closed `flow-capability-deepening` Objective, driven by the
2026-07-01 architecture review of `ts/packages/capabilities/flow` (preserved
verbatim at `architecture-review.html`; diagrams need a browser). Restructured
in place on 2026-07-02 after a depth audit
(`updates/2026-07-02T150856Z-depth-audit-and-restructure.md`). Rebaselined
against trunk on 2026-07-03: every Work row has landed on `master` as squash
commits, and repo-wide renames that landed after this record's updates were
written are folded into current-state prose here.

**Naming rebaseline (2026-07-03, refreshed after ADR 0026).** The repo-wide `sdl → ji → ns` cutovers and
package restructuring landed after this Objective's work: the package is now
`@ns/flow` (was `sdl-flow`), the CLI surface is `ns flow …` (was
`sdl flow …`), `src/land-stack/` moved to `src/land/stack/`, commands live
under `src/ns/commands/`, and the old `src/shared/` files this record names
moved (`failure-catalog.ts` → `src/phase-stream/`, `text-generation.ts` →
`src/submit/`). Historical `updates/` files keep the superseded names; they
are immutable provenance. Those renames are owned by the rename initiatives
and the package restructuring work, not this Objective.

## Thesis

Round 2 originally committed the review's three `Strong` candidates. They
landed, but the depth audit showed they delivered **consolidation and
co-location** more than **interface depth**: the Graphite channel merged four
wrapper files yet kept an argv-shaped, four-method interface with caller-side
arg-building; the autobranch failures were co-located but adding one failure
was still three edit sites; only the PR-description slice produced a genuinely
deep module.

The audit also surfaced the generator behind the symptoms: **the half-finished
land migration**. Flow's land execution ran beside the Land Domain Core
(`flow/src/land/`) instead of on it, crossing the Flow Land Compatibility
Boundary through mirror types, duplicate `type↔kind` mappers, and duplicated
label heuristics — a standing wrapper factory that successive deepening rounds
kept paying interest on. `flow/CONTEXT.md` recorded the target shape (Flow
Stack Preflight Adapter, Land Gateway Set); the code had never converged to
it.

The restructured Objective took two jobs, in one record — and both are now
delivered and merged to `master`:

1. **Finish the interfaces round 2 started** — the channel is
   operation-shaped, `regenerate-pr --force` has real semantics, the forwarder
   shims are deleted, and the one-edit-site failure catalogs exist alongside
   the submit gateway de-leak.
2. **Retire the generator** — land execution runs on the Land Domain Core's
   four-gateway `LandContext`, and the compatibility round trip is deleted
   (review candidate #4 dissolved rather than consolidated).

Verified on trunk 2026-07-03: zero `runRaw`, `LandPlanForFlow`,
`preloadedShape`, `flow-adapter-failure`, or `plan-mapping` references in
flow/ccc; `plan-mapping.ts` and the five forwarder shims absent; all
slice-added gateway methods present on `LandContext` in `src/land/types.ts`.

## Scope

Six work streams, all delivered 2026-07-01→02 and landed on `master`
(squash-merge SHAs per row in `roadmap.md`):

1. **Operation-shape the Graphite command channel.** The channel owns
   operation specs; the seven exported arg-builders folded in; `runRaw`
   removed; caller-side `maintenance.kind` method selection absorbed;
   `deleteFinalLocalBranch` reconciled with the spec shape.
2. **`regenerate-pr --force`, full semantics.** `--force` regenerates a
   fingerprint-current body *and* skips confirmation, matching land's
   `--force`, per ADR 0014's danger-tier convention.
3. **Delete the forwarder shims** (review #6): the five true single-purpose
   rename/re-export files deleted; `graphite-metadata-command.ts` folded into
   the channel instead (not a pure shim).
4. **Land Domain extraction — inventory, then migration.** The 13-behavior
   inventory map, then nine autonomous migration slices moving execution onto
   the Land Domain Core.
5. **Retire the compatibility round trip** (dissolved review #4): the
   `LandPlanForFlow` mirror, both `type↔kind` mappers, and the duplicate
   operation-label heuristics deleted; one preflight crossing remains,
   matching the documented Flow Stack Preflight Adapter.
6. **De-leak the submit gateway + one-edit-site failure catalogs** (review #7
   plus the autobranch residual): `SubmitGateway` returns domain results with
   Graphite-stderr classification behind the seam; submit and autobranch share
   one per-failure catalog idiom.

## Non-Goals

- Any change to the **Flow Capability API** (`@ns/flow/api`, formerly
  `sdl-flow/api`) surface consumed by CCC. Existing exports kept working
  through every slice, including the extraction.
- The land presentation surface (review #5) until its Parked-row decision —
  see Parked in `roadmap.md`.
- Promoting the Graphite channel to a neutral package below Flow. Revisit only
  when a second real consumer appears.
- Building a scripted-channel test adapter. Scripted `pi.exec` is the
  canonical land test seam (decided 2026-07-02); the channel seam makes no
  substitutability claim. Verified on trunk: land scenario tests still script
  `pi.exec` (`ScriptedExec` in
  `test/unit/land-stack-command-scenarios.test.ts`).
- Rewriting historical `updates/` files; corrections append.
- The repo-wide `sdl → ji → ns` renames and package restructuring that moved this
  record's named paths; other initiatives own that work.

## Completion Criteria

Depth is measured at the interface. Each criterion is a checkable fact about
what a caller must know. Status verified against trunk 2026-07-03; paths are
current (`src/land/stack/` was `src/land-stack/` when the work landed).

- **Channel — holds.** Adding a new `gt` mutation to the land path requires a
  new operation spec only (`src/land/stack/graphite-command-channel.ts`);
  `runRaw` is gone from the interface (zero references in flow src/test); no
  caller branches to select a channel method; streamed-vs-raw is not
  caller-visible vocabulary. Land scenario tests script `pi.exec` and assert
  emitted argv.
- **Regenerate — holds.** `ns flow regenerate-pr --force` regenerates a
  fingerprint-current managed region without prompting
  (`src/ns/commands/regenerate-pr.ts` wires the fingerprint policy from
  `--force` and suppresses confirmation); the default path still skips when
  current and still confirms; the no-op compatibility sentence and notice are
  deleted. `test/scenario/regenerate-pr-command.test.ts` covers both paths.
- **Shims — holds.** The five forwarder files are deleted (verified absent);
  the surviving naming seam is now `src/submit/text-generation.ts` (moved
  from `shared/` by the later restructuring); `graphite-metadata-command.ts`
  was absorbed by the channel.
- **Extraction — holds.** Land execution behaviors run on the Land Domain
  Core's four gateways (`src/land/types.ts` `LandContext`: git, graphite,
  github, worktrees), including the slice-added methods
  (`snapshotBackupRefs`, `prepareSubmitUpdate`, `prepareRestackForSubmit`,
  `refreshBranchFromRemote`, `deleteLocalBranch`, `restackUpstack`,
  `branchChildren`, `squashMergePullRequest`, `freeSlots`); no behavior is
  orchestrated twice.
- **Round trip — holds.** `plan-mapping.ts` is deleted; zero
  `LandPlanForFlow`, `preloadedShape`, or `flow-adapter-failure` references
  in flow/ccc; Flow crosses into the Land Domain Core at the documented
  preflight adapter. CCC imports only `@ns/flow/api`, no private Flow land
  internals.
- **Submit/catalog — holds.** `SubmitGateway` returns domain results;
  `submit-detect.ts` is imported only by the gateway implementation and its
  own test (verified importer graph); adding one failure is one catalog entry
  (`src/phase-stream/failure-catalog.ts` idiom,
  `test/unit/failure-catalog.test.ts`).
- **Closure gate — open.** The Parked row (#5) must be promoted, re-scoped,
  or explicitly dropped with rationale in closure prose before `closed.md` is
  written; full TS validation (`just` entrypoint) must be green on the final
  state at close time. This is the only remaining gate.

## Definition of Progress

All executable roadmap rows are delivered; this policy is retained in
compressed form for provenance and applies again only if the Parked row is
promoted (which would need fresh row-level policy prose).

Keepable progress meant: exactly one roadmap row (or one named migration
slice) advanced on a `gt`-created feature branch, never on `master`; the full
TS validation suite green (`just` entrypoint); `@ns/flow/api` exports
untouched or proven compatible; the row's `Evidence:` expectation demonstrated
by a named test; a Semantic Update recording what landed. Never: duplicated
orchestration left unrecorded, new wrappers/mirrors/mappers at the (now
deleted) compatibility boundary, or edits to historical `updates/` files.

## Runner Policy

Spent: no `Policy: direct` or `Policy: preview` rows remain executable. The
one remaining action — the Parked row's promote/re-scope/drop decision — is
owner judgment, not runner-executable work. The historical policy that
governed the migration (autonomous slices under a deterministic slice gate;
mutation-command argv frozen byte-for-byte; read-only fact-command argv
relaxed 2026-07-02; scoped file-boundary exceptions for capability-kit/ccc
test pins) is recorded in
`updates/2026-07-02T181138Z-autonomous-slice-policy.md` and
`updates/2026-07-02T200807Z-slice2-argv-gate-relaxed-for-facts.md`. What will
not happen unless explicitly requested: closing or archiving this Objective,
mutating GitHub, or landing anything on `master`.

## Assumptions and Risks

**Assumptions**

- The Land Domain Core (`flow/src/land/` root files, four-gateway
  `LandContext`) was the intended destination for land execution, per
  `flow/CONTEXT.md` — confirmed by delivery. CONTEXT.md's vocabulary (Flow
  Land Execution, Land Domain Core, Land Gateway Set, Flow Stack Preflight
  Adapter, Flow Land Compatibility Boundary) is still present on trunk
  2026-07-03, updated to `@ns/flow` naming.
- No other Objective owns follow-on flow-land work:
  `flow-capability-layer-cleanup` is closed; this is the only open flow
  Objective (verified against the active list 2026-07-03).
- Round-2's delivered slices are accepted as landed — now confirmed: every
  row's work is on `master` as squash commits (SHAs in `roadmap.md`).
- Post-landing trunk refactors (structured land confirmations, maintenance
  control-flow refactors, hermetic land sandbox integration coverage,
  multi-root descendant restack) built on the delivered shape rather than
  reverting it — supported by the structural verification above, not
  re-reviewed change by change.

**Risks**

- **Parked-row premise decay (the remaining live risk).** The presentation
  re-inventory premise gets staler while the record stays open: beyond the
  extraction churn the parked note predicted, trunk has since refactored land
  presentation and confirmation flow. The three files still exist at
  `src/land/stack/` (`presentation.ts` 514 lines, `land-presentation.ts` 132,
  `command-stream.ts` 250 — near the recorded 519/132/250), but any promotion
  must start with a fresh inventory.
- **Extraction blast radius — retired.** The live merge path runs on the Land
  Domain Core's gateways with the round trip deleted; the migration completed
  under the slice gate with mutation argv pins unchanged.
- **`--force` confirmation bypass — resolved.** ADR 0014
  (`docs/adr/0014-clinkr-confirmation-danger-tiers.md`) standardizes
  `--force`/`-f` as the sanctioned non-interactive authorization.
- **Channel seam misread — mitigated and aging out.** The scripted-channel
  adapter never existed; scripted `pi.exec` remains the canonical land test
  seam (verified on trunk). `orientation.md` still carries the warning.

## Open Questions

- Does the Land Domain Core stay a `@ns/flow` subpath after the migration, or
  graduate to its own package? Current trunk state: it is exported as
  `@ns/flow/land/api` and `@ns/flow/land/testing`. Graduation is out of scope
  for this record unless a second consumer appears.
- Channel promotion trigger — partially settled 2026-07-02: the
  operation-shaped channel is the gateway backend (preserving per-command
  streaming). A neutral home / real substitution seam still waits for a
  second consumer, per Non-Goals.
- What does the land presentation surface (#5) look like after the extraction
  and the subsequent trunk refactors — still three files split by mechanism,
  or partially collapsed for free? Re-inventory at promotion time; this is
  the closure-gate decision's first act.
