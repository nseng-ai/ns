# Roadmap

## Work

- [x] Establish the catalog and the seam-introduction ladder: Inject Dependency, Inject Gateway,
      Introduce Gateway, plus the dependency-injection vocabulary note, in
      `docs/conventions/test-boundary-refactorings.md`. Evidence: open PRs #4103–#4107, #4111
      (branches `add-test-boundary-refactoring-catalog` through `clarify-test-boundary-refactorings`).
- [x] Inventory all 31 standing-objective updates and produce the candidate slate with merge
      analysis. Merges applied: split-mixed-file and export-shape-residue into Move Real-Boundary Test
      to Integration; coverage-ownership partition into Relocate Behavior Tests to Owning Package;
      fake-registry seam into Substitute Synthetic Fixture; dissolve-mixed-contract-file into Separate
      Static Contract from Dynamic Loading; remediation hierarchy and explicit lane wiring into the
      lane-containment entries' constraints. The procedure family was excluded (see Parked).
- [~] Disposition item 1 — **Move Real-Boundary Test to Integration**: relocate a real-boundary
  test (real Git, subprocess, cold runtime, dynamic import) into `test/integration/`; variants:
  whole-file move, split mixed file, leave export-shape assertion behind. Evidence:
  `2026-06-20T181625Z-vibechk…`, `2026-06-20T184212Z-asdl-core…`, `2026-06-23T230148Z-sdl-core…`,
  `2026-06-28T194006Z-slow-default…`, `2026-06-28T195309Z-slot-alias…`, `2026-07-01T132808Z-sdk…`.
  Presented to the user; awaiting accept/rename/split/drop, then author the entry if accepted.
- [ ] Disposition item 2 — **Collapse Matrix to Representative Smoke**: N-case composed matrix
      moves to integration or onto a fake seam; one representative case stays default; per-case
      variation delegated to lower-level coverage. Evidence: `2026-07-07T211556Z-ns-cli-skills-path…`,
      `2026-06-24T122002Z-repeated-integration-setup…`, `2026-06-23T231600Z-flow-command…`.
- [ ] Disposition item 3 — **Retain Representative Smoke**: when behavior coverage leaves the
      default lane, keep one-or-few real-boundary tests (help/schema, manifest, leaf import) in
      integration. Cited across ~8 updates as the companion rule to nearly every migration. Decision:
      standalone entry that others cite, or shared constraint.
- [ ] Disposition item 4 — **Extract Pure Core**: pull script/tool logic into a pure function so
      default tests need no boundary; thin adapter keeps a runtime smoke in integration. Evidence:
      `2026-06-21T131815Z-source-cli-shim…`.
- [ ] Disposition item 5 — **Relocate Behavior Tests to Owning Package**: move command behavior
      from host CLI + real extension loader to the owning package's command objects with fake host
      collaborators; one integration smoke proves the real loader path; host and package coverage
      ownership partitioned, never duplicated. Evidence: `2026-06-23T231600Z-flow-command…`,
      `2026-06-24T170221Z-flow-command…`, `2026-06-28T184335Z-handoff…`,
      `2026-06-28T190054Z-flow-push…`, `2026-06-28T192156Z-flow-autobranch…`,
      `2026-06-28T194006Z-slow-default…`.
- [ ] Disposition item 6 — **Substitute Synthetic Fixture**: test generic host machinery
      (parser/group/lazy-load) against synthetic fixtures instead of checked-in artifacts; the
      carrying seam is Inject Dependency (package-local fake registry with an anti-generalization
      rule). Evidence: `2026-06-28T184335Z-handoff…`, `2026-06-29T123612Z-completion…`,
      `2026-06-29T125824Z-roaster…`.
- [ ] Disposition item 7 — **Separate Static Contract from Dynamic Loading**: default asserts the
      registration/catalog source of truth without invoking loader thunks; minimal dynamic-loading
      smokes move to integration; includes dissolving the mixed contract file and reassigning each
      assertion to its cheapest owner. Single-update evidence:
      `2026-07-25T163444Z-ns-host-contract-boundaries…` (293ms → 11ms).
- [ ] Disposition item 8 — **Check Golden Artifact for Drift**: byte-for-byte comparison against a
      checked-in artifact substitutes for executing it in the default lane. Single-update evidence:
      `2026-06-21T131815Z-source-cli-shim…`.
- [ ] Disposition item 9 — **Contain Ambient-State Test in Isolated Lane**: tests whose subject is
      module-cache/process-global state move to `test/isolated/` (`isolate: true`), only after the
      remediation hierarchy fails (injection → explicit env/cwd → manual time → auto-restored stubs →
      owned lifecycle seam); lane wired explicitly (own just recipe, separate non-draft CI job).
      Evidence: `2026-07-10T220455Z-isolated-lane…`.
- [ ] Disposition item 10 — **Test Real Adapter in Sanity Lane**: concrete adapter plus low-level
      vendor/runtime module mocks only; never mock domain logic, semantic gateways, or the subject;
      integration keeps real external compatibility. Single-update evidence:
      `2026-08-03T123350Z-gitplane-real-adapter-sanity-lane…`.
- [ ] Disposition item 11 — **Guard the Shared-Cache Contract**: static source bans over the
      contamination vocabulary (`NS_TS_BAN_SHARED_TEST_*`) with diagnostics pointing at the preferred
      seam; exemptions scoped to isolated-cache lanes. Evidence: `2026-07-10T220455Z-isolated-lane…`,
      `2026-08-03T123350Z-gitplane…`.
- [ ] Decide the catalog's section structure for accepted families (test relocation,
      test-subject restructuring, lane establishment/containment) and land the accepted entries with
      `CONTEXT.md` vocabulary sync.
      Evidence: targeted docs checks and repo validation passed.

## Parked

- [ ] The audit/proof/measurement procedure family (rebaseline sweep, park-with-negative-
      classification, dual-config discovery proof, out-of-lane structural sweep, boundary-vocabulary
      greps, detached-worktree timing protocol, codify-the-standard). Excluded from this catalog by
      user decision; revisit only on explicit request, likely as `ts/TESTING.md` doctrine or a
      companion conventions doc rather than catalog entries.
