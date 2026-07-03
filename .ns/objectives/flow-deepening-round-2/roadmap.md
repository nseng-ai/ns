# Roadmap

Candidate numbers refer to the 2026-07-01 review at `architecture-review.html`
(diagrams need a browser). Restructured 2026-07-02 — see
`updates/2026-07-02T150856Z-depth-audit-and-restructure.md`. Rebaselined
2026-07-03 against trunk: every Work row's branch stack landed on `master` as
squash commits (`landed:` SHA per row); row prose keeps the historical branch
commits as delivery provenance. Paths in row prose are the pre-rename names in
force when each row landed (`land-stack/`, `shared/`, `sdl flow`); current
trunk names are in `objective.md`'s naming rebaseline. All paths relative to
`ts/packages/capabilities/flow/` unless stated.

## Work

- [x] Collapse the Graphite command channel (review #1)
      Delivered 2026-07-01: wrapper cluster (`command-exec.ts`,
      `graphite-command-args.ts`) collapsed into
      `land-stack/graphite-command-channel.ts`; `pi` triplet removed via
      `land-runtime.ts`; normalization single-layer; special cases named.
      Landed on master (squash `610948b05`, with the PR-description row).
      Evidence correction (2026-07-02 depth audit): scenario tests script
      `pi.exec` (`test/unit/land-stack-command-scenarios.test.ts`) — that is
      the canonical seam; no scripted-channel adapter exists or is planned.
      Interface depth was delivered by the operation-shaping row below.
      Trunk note (2026-07-03): a new, unrelated `land/stack/command-exec.ts`
      helper exists on trunk (imports from the channel); it is not a
      resurrection of the collapsed wrapper cluster.
- [x] Give each autobranch failure one home (review #2)
      Delivered 2026-07-01: shared result types moved to
      `autobranch/flow-result.ts`; classify/format switches co-located with
      their arms; central formatting file deleted. Landed on master (squash
      `610948b05`, which carried all three round-1 rows).
      Evidence correction (2026-07-02 depth audit): co-location landed, but
      adding a failure was still three edit sites. The one-edit-site catalog
      was delivered by the submit/catalog row below.
- [x] Unify the PR-description update path and close the fingerprint overwrite bug (review #3)
      Delivered 2026-07-01 as specified: one update module
      (`submit/pr-description-orchestration.ts`), duplicate deleted,
      regenerate skips an already-current body with a scenario regression.
      Landed on master (squash `610948b05`). Residual `--force` semantics
      delivered by the row below.
- [x] Operation-shape the Graphite command channel
      Delivered 2026-07-02 (runner step, branch commit `2163da469` on
      `flow-operation-shaped-graphite-channel`; landed on master as squash
      `73d5fbf7d`): the channel owns operation specs; the seven exported
      arg-builders and `formatGraphiteCommand` pairing folded in; `runRaw`
      removed from the interface; the
      `maintenance.kind === "optional-descendant"` method selection absorbed;
      `deleteFinalLocalBranch` reconciled with the spec shape;
      `graphite-metadata-command.ts` deleted into the channel.
      Evidence: grep shows zero `runRaw` and zero arg-builder references in
      flow src/test (re-verified on trunk 2026-07-03); land scenario tests
      passed with unchanged `pi.exec` argv assertions; a unit test
      demonstrates a new mutation needs only a spec entry; full DoP suite
      green at delivery, parent re-verified (47 files / 419 tests).
- [x] Give `regenerate-pr --force` full force semantics (decided 2026-07-02)
      Delivered 2026-07-02 (runner step, branch commit `bbdd2b5f7` on
      `flow-regenerate-pr-force-semantics`; landed on master as squash
      `fcb81f440`): `--force`/`-f` forces the fingerprint policy and
      suppresses the confirmation step; the no-op compatibility sentence and
      notice branch deleted. Precondition held: ADR 0014
      (`docs/adr/0014-clinkr-confirmation-danger-tiers.md`) standardizes
      `--force`/`-f` as the sanctioned non-interactive authorization.
      Evidence: `test/scenario/regenerate-pr-command.test.ts` covers force
      regenerating a fingerprint-current body without prompting, default
      no-op on current, and default prompt on stale (still present on trunk
      2026-07-03, command now `ji flow regenerate-pr`); full DoP suite green
      at delivery.
- [x] Delete the forwarder shims (review #6)
      Delivered 2026-07-02 (runner step, branch commit `67c6e49ee` on
      `flow-delete-forwarder-shims`; landed on master as squash `87cc17915`,
      with the inventory): the five forwarder files (`shared/git.ts`,
      `shared/text-helpers.ts`, `shared/checkpoint-message.ts`,
      `submit/format.ts`, `autobranch/short-sha.ts`) deleted with callers
      pointed at the real interfaces; no replacement re-export;
      `shared/text-generation.ts` survived as the real naming seam (now
      `submit/text-generation.ts` on trunk after the later restructuring).
      Evidence: file absence re-verified on trunk 2026-07-03; flow suite
      passed at delivery (44 files / 413 tests); full DoP suite green.
- [x] Land Domain extraction — inventory (no code moves)
      Delivered 2026-07-02 (parent-executed read-only investigation; recorded
      in the same master squash `87cc17915`): the migration map lives in
      `updates/2026-07-02T174146Z-land-extraction-inventory.md` — 13
      behaviors (B1–B13) classified presentation vs execution with
      method-level gateway gaps, plus a 10-slice migration decomposition
      ordered lowest-risk-first. Premise corrections it established: five
      boundary crossings existed (not one adapter plus mirror); `src/land/`
      was not yet the domain boundary; `LandGraphiteGateway`'s mutation
      methods were unwired no-op stubs.
- [x] Land Domain extraction — migrate execution onto the Land Domain Core
      Delivered 2026-07-02 as nine autonomous runner-step slices on one
      branch stack, per the map in
      `updates/2026-07-02T174146Z-land-extraction-inventory.md`, under the
      deterministic slice gate (`Policy: direct` per slice — owner decision,
      `updates/2026-07-02T181138Z-autonomous-slice-policy.md`; read-only
      fact-command argv relaxed 2026-07-02,
      `updates/2026-07-02T200807Z-slice2-argv-gate-relaxed-for-facts.md`;
      mutation argv pins byte-for-byte throughout). Slices, branch commits,
      and master squash SHAs (per-slice detail in the named updates):
      1. Strict merge gate + PR validators (`d9ad6f18e` → `733a84fca`) —
      `updates/2026-07-02T195616Z-extraction-slice-1-merge-gate-validators.md`
      2. Real `stackShape`/facts backend (`c7ff48fc5` → `be3e07b2a`) —
      `updates/2026-07-02T202105Z-extraction-slice-2-facts-backend.md`
      3. Isolated fast-path merge via gateways, adds
      `squashMergePullRequest` + MERGED verification (`ee486b9f0` →
      `04cf9784e`) —
      `updates/2026-07-02T203536Z-extraction-slice-3-isolated-fast-path.md`
      4. Backup refs onto `LandGitGateway` via `snapshotBackupRefs`
      (`1df170eb6` → `384853388`) —
      `updates/2026-07-02T204810Z-extraction-slice-4-backup-refs.md`
      5. Pre-merge submit/restack through the Graphite gateway
      (`e7f834fdd` → `20d88c5c7`) —
      `updates/2026-07-02T205626Z-extraction-slice-5-premerge-submit.md`
      6. Slot-action seam (`freeSlots`) + pre-merge slot freeing
      (`e3a8da316` → `c473cfd5b`) —
      `updates/2026-07-02T210812Z-extraction-slice-6-slot-free-seam.md`
      7. Stack merge loop onto gateways, zero interface changes
      (`8f60ae783` → `8d7da8d44`) —
      `updates/2026-07-02T211745Z-extraction-slice-7-merge-loop.md`
      8. Post-merge Graphite maintenance: the five map-named methods,
      guards as typed policy parameters (`b111629c0` → `444ec89f9`) —
      `updates/2026-07-02T213710Z-extraction-slice-8-graphite-maintenance.md`
      9. Post-landing slot cleanup (`28b9fe001` → `d7e142477`) —
      `updates/2026-07-02T214441Z-extraction-slice-9-migration-row-complete.md`
      Settled decisions that bounded the slices: isolated fast path stays a
      Flow shortcut (gateway-backed merge, MERGED verification added, no
      CONTEXT.md vocabulary change); the operation-shaped channel is the
      gateway backend preserving per-command streaming; `freeSlots` keeps
      shelling out to the slot-free CLI, only the call site moved.
      Residuals carried into the retirement row (all since retired):
      `pr-facts.ts` delegation adapters, `preloadedShape` bypass,
      `toLandFailure` collapse, `plan-mapping.ts` mirror/mappers.
- [x] Retire the compatibility round trip (dissolves review #4)
      Delivered 2026-07-02 (runner step, branch commit `a7c05569a` on
      `flow-r2-round-trip-retirement`; landed on master as squash
      `dd09a496a`) — see `updates/2026-07-02T220602Z-round-trip-retired.md`.
      `plan-mapping.ts` deleted (mirror, both mappers, duplicate label
      heuristic, nothing-to-land copy); `pr-facts.ts` delegation adapters and
      the `preloadedShape` bypass retired; no `flow-adapter-failure`
      collapse. Evidence: zero `LandPlanForFlow` / `plan-mapping` /
      `preloadedShape` / `flow-adapter-failure` references in flow/ccc
      (re-verified on trunk 2026-07-03); ccc clean of private Flow land
      imports; mutation argv pins unchanged.
- [x] De-leak the submit gateway and build the shared failure catalog (review #7 + autobranch residual)
      Delivered 2026-07-02 (runner step, branch commit `06ccafe87` on
      `flow-submit-failure-catalog`; landed on master as squash `edb279176`):
      Graphite-stderr classification moved into `submit/submit-gateway.ts`
      behind the `SubmitGateway` seam (regex classifiers isolated in
      `submit/submit-detect.ts`, imported only by the gateway implementation
      and its own test — importer graph re-verified on trunk 2026-07-03);
      `SubmitGateway` returns domain results, raw command transcripts pass
      through for display only. Shared catalog idiom (entry = arm + verdict +
      message, exhaustive by type; now `phase-stream/failure-catalog.ts` on
      trunk) applied to submit failures (`submit/submit-failure-catalog.ts`)
      and both autobranch transaction switches.
      Evidence: `test/unit/failure-catalog.test.ts` demonstrates adding a
      failure arm is one catalog entry (still present on trunk); flow suite
      passed at delivery (415 tests); full DoP suite green.

## Parked

- [ ] Unify the land presentation surface (review #5)
      Parked behind the extraction, which is now fully landed — this row is
      the Objective's only remaining item and its promote/re-scope/drop
      decision is the closure gate.
      Premise (rebaselined 2026-07-03): the three files exist on trunk at
      `src/land/stack/` — `presentation.ts` (514 lines),
      `land-presentation.ts` (132), `command-stream.ts` (250) — but their
      inputs have churned twice since the original inventory: the extraction
      slices/retirement, then post-landing trunk refactors of land
      confirmation and maintenance control flow. Any promotion starts with a
      fresh inventory.
      Closure gate: this row must be promoted, re-scoped, or explicitly
      dropped with rationale before the Objective closes.
