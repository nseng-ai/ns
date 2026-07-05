# Internal Packages Space

## Thesis

The ns package taxonomy has two primary homes for code — tested platform packages in `ts/packages/*` and consumer instances in `.ns/*` — and a class of code falls between them: tested, package-grade tooling that exists only to operate this repo, not to ship as part of ns-the-product. The proof is the subpackage conformance machinery squatting in `ts/packages/infra/foundation/test/support/typescript-style-guard/`. Rename `ts/packages/local/` to `ts/packages/internal/`, broaden its charter from "private Pi-native tools" to "tested, repo-internal tooling," and audit the repo for tools and scripts that should be packaged there. The local space already uses the reserved `@internal/*` scope, so the directory rename makes directory and scope coherent with no scope work.

## Scope

- Rename `ts/packages/local/` → `ts/packages/internal/` (currently holds only `@internal/pi-tools`) and update all references, including the style-guard local-space constants.
- Rewrite the `local/` charter in `ts/packages/README.md` as the `internal/` charter: tested, repo-internal tooling; the middle rung of the promotion ladder `.ns/*` prototype → `packages/internal/*` → platform package. The charter must explicitly distinguish `internal/` from the existing `tools/` tier: `internal/` means enforced no-outside-runtime-dependents and never published; `tools/` means standalone and potentially shippable.
- Add the third rung to `docs/conventions/platform-and-consumer.md` so consumer-side code has a named tested home and provisional artifacts have a concrete promotion target.
- Carry the boundary rule through the rename. The style guard already enforces it as `NS_TS_LOCAL_SPACE_ADMISSION` (path↔scope coupling, mandatory `private: true`, no outside workspace dependents) with a failing-case test and a real-repo conformance test; no new rule is needed. Rename the rule and constants to the internal space and document the dependency semantics: runtime dependencies (`dependencies`, `optionalDependencies`, `peerDependencies`) on `internal/*` from outside are banned; `devDependencies` and test consumption are allowed — the first resident's consumer relies on this carve-out.
- Audit the repo for internal-package candidates — `ts/packages/*` packages that are actually repo-internal (e.g. `@ns/vibechk` in `ts/packages/tools/`), machinery embedded in test-support trees, justfile-recipe-backed scripts, `.ns/*` tooling already in the pnpm workspace (`../.ns/reviews/*/tools/*`), and Pi extensions — producing a per-candidate promote/keep/park recommendation.
- Migrate one proving resident: extract the subpackage conformance machinery from `infra/foundation` test support into a proper internal package. Its only current consumer is the style-guard suite itself, so the extraction proves the charter rather than enabling reuse.

## Non-Goals

- Migrating every audit candidate; migrations beyond the first resident are follow-up work sequenced from the audit report.
- Redesigning the `.ns/*` consumer-instance layout or the platform package categories themselves.
- Publishing or distributing internal packages; they remain private and repo-only by definition.
- Any npm-scope work: the local space already uses the reserved `@internal/*` scope, which the directory rename aligns with as-is.
- Sweeping the untracked node_modules-only ghost directories under `ts/packages/` (~26 of them, e.g. top-level `sdl/`, `flow/`, `vibechk/`): they are per-worktree disk leftovers, not repo state, so their cleanup cannot land as objective work (see the parked ghost-directory guard row).

## Completion Criteria

- `ts/packages/internal/` exists with the charter documented in `ts/packages/README.md` (including the `internal/` vs `tools/` distinction), and `ts/packages/local/` is gone.
- `docs/conventions/platform-and-consumer.md` names the internal rung and its promotion path in both directions.
- The boundary rule remains enforced mechanically under its renamed identity, with its runtime-vs-dev dependency semantics stated in the charter.
- The subpackage conformance machinery lives in an internal package and the style guard consumes it from there as a dev/test dependency, per the boundary semantics.
- An audit report exists with a per-candidate disposition, and its accepted follow-up migrations are recorded (here as parked rows or as new objectives).

## Assumptions and Risks

Assumptions:

- `ts/packages/local/` holds only `@internal/pi-tools`, so the directory rename is mechanically small (verified 2026-07-04).
- The pnpm workspace glob `packages/*/*` covers the renamed directory without workspace config changes (verified in `ts/pnpm-workspace.yaml`).
- The boundary rule already exists as `NS_TS_LOCAL_SPACE_ADMISSION` in `ts/packages/infra/foundation/test/support/typescript-style-guard/local-space.ts`, with a failing-case test and a real-repo conformance test; its edge collector deliberately scopes to runtime dependency fields, leaving `devDependencies` and source imports out of scope (verified 2026-07-04).
- The subpackage system is the right first resident: it is deterministic, tested, and currently homed in another package's test tree.

Risks:

- Charter creep: "internal" in an all-private repo is ambiguous without a crisp definition; the concrete instance is the existing `tools/` tier (`areg`, `packagechk`, `vibechk`), which is also tested and arguably repo-internal. Mitigation: the charter rewrite states the `internal/` vs `tools/` distinction explicitly, with the boundary rule as its teeth.
- The `sdl.subpackages` metadata format could plausibly become platform surface someday; extracting it into `internal/` must record its promotion path per `docs/conventions/platform-and-consumer.md` rather than treating internal as terminal.
- The audit can balloon into relocating half the repo; the per-candidate disposition format (promote/keep/park) is the containment mechanism.
- Adjacent open objectives (`repo-ontology`, `ts-cli-core-structural-cleanup`) touch package taxonomy docs and consolidation; coordinate rather than duplicate. The repo-ontology CONTEXT-MAP inventory names `ts/packages/local/pi-tools/` and the `@internal/pi-tools` naming exception, so the rename obligates a drift report to repo-ontology per its rules.

## Open Questions

- Should this objective carry an `orientation.md` (cross-cutting: "new repo-internal tooling goes in `packages/internal/`, never take a runtime dependency on it") while the transition is in flight? Not created pending explicit confirmation.
- Which audit candidates beyond the first resident get promoted, and do they land as parked rows here or as new objectives?
- Scope + audit + first resident was adopted as the working scope without live confirmation (user AFK during interview); confirm or narrow to space + audit only. Note that the enforcement work largely disappeared (the boundary rule already exists), which shrinks the delta between the two options.

## Closure

Closed 2026-07-05 as completed. The active scope landed: the tracked package space is `ts/packages/internal/`, the `internal/` charter and runtime-dependency boundary are documented, `docs/conventions/platform-and-consumer.md` names the middle rung and promotion path, the style-guard rule now uses the internal-space identity, the candidate audit is recorded at `references/internal-package-audit.md`, and the proving resident lives as `@internal/typescript-style-guard` with the style-guard suite consuming it as a dev/test dependency.

Completion evidence is captured in `roadmap.md`: all `## Work` rows are checked with file-level evidence, including `just ts-test-typescript-style-guard` and full `just ts-test` green for the first-resident extraction. The remaining known work is intentionally parked, not active scope: optional ghost-directory guard work, future migrations of audit candidates, topology-report promotion, and `.pi/extensions/*` de-embedding. Those should be unparked here before archive or split into new Objectives when someone chooses to pursue them.

Caveat: ignored per-worktree ghost directories may still exist on disk under names such as `ts/packages/local/`; they are not tracked repo state and were explicitly non-goal/parked cleanup material.
