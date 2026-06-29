# Roadmap

## Work

- [x] Inventory Roaster surfaces, consumers, and compatibility-sensitive behavior.
  - Policy: direct execution after preview.
  - Guidance: inspect `ts/packages/roaster/**`, `.sdl/reviews/**`, Roaster public skills, Pi command-surface metadata, docs/ADRs, install/shim references, package exports, and source imports of `@sdl/roaster`. Classify the current standalone CLI commands (`review list`/`ls`, `review run`, `review log`, `roast list`, hidden `exec record-findings`, hidden `exec publish-findings`), Branch Memory review-log semantics, GitHub publication boundary, and any current package-root consumers.
  - Evidence: completed by `updates/2026-06-28T193338Z-roaster-surface-inventory.md`, which records command/API/doc/skill/storage surfaces, call-site categories, compatibility constraints, and recommends the next slice as adding a narrow `@sdl/roaster/api` plus SDL command-face discovery for low-risk read/list operations.

- [x] Define and implement the initial `@sdl/roaster/api` Capability API boundary.
  - Policy: direct execution after preview for additive/narrowing API work; steer first before removing package-root exports or exposing broad internals.
  - Guidance: start from concrete consumers discovered by inventory. Prefer a curated API over review definitions, review execution request/result types, review-log summaries, publication request/result types, and gateway-injected operation entrypoints only when needed. Keep command parsing, presentation, prompt resources, and private adapters out of the API.
  - Evidence: completed by `updates/2026-06-28T204400Z-roaster-api-boundary.md`; package exports now include `./api`, the API is a narrow fake-testable client facade over gateway-injected runtime/real context options, and tests import `@sdl/roaster/api` without exposing CLI renderers, prompt resources, adapter classes, fake helpers, raw command machinery, or GitHub publication.

- [x] Prove Roaster's SDL Command Face and selected command loading.
  - Policy: direct execution after preview using existing SDL grouped-command mechanics by default; steer first before command taxonomy changes or public SDK expansion.
  - Guidance: model Roaster as an SDL extension command group while preserving current review/roast/exec semantics unless the inventory records a better taxonomy. Discovery/help should be side-effect-light and should not eagerly run model, git, Branch Memory, or GitHub operations.
  - Evidence: completed by `updates/2026-06-28T205700Z-roaster-sdl-command-face-proof.md`; SDL command scenario tests cover top-level manifest discovery, selected help/schema loading, and a fake-exec representative `sdl roaster review-list --format json` command without eager model, Branch Memory, or GitHub work.

- [x] Migrate low-risk read/list surfaces to the SDL command face.
  - Policy: direct execution after preview for implementation and tests.
  - Guidance: start with `review list`, `review ls`, `review log`, and `roast list` because they exercise catalog/log rendering without model execution or GitHub publication. Preserve JSON/Markdown behavior, finite counts where applicable, and review-log namespace/key semantics. While doing this row, split read/list/log builders into domain-result operations before CLI/API wrapping, following the Objective `buildObjectiveListResult()` precedent; the initial API boundary intentionally kept a transitional `ClinkrExit` conversion and parked that cleanup here.
  - Evidence: completed by `updates/2026-06-28T204211Z-roaster-nested-read-list-migration.md`; SDL now supports structured nested extension paths and Roaster contributes `sdl roaster review list`, `review ls`, `review log [key]`, and `roast list`. Fake-backed SDL scenarios cover discovery/help/schema and JSON execution including Branch Memory review-log namespace/key semantics; existing Roaster CLI/API suites remain green, and read/list API methods consume domain-result builders instead of `ClinkrExit` conversion.

- [ ] Migrate review execution and same-session findings recording.
  - Policy: direct execution after preview for fake-backed implementation; ask before running real model-backed reviews or writing real Branch Memory logs as validation.
  - Guidance: move `review run` and `exec record-findings` through the SDL command face while keeping Domain Core gateway-injected. Preserve read-only review execution plus additive Branch Memory review-log writes, model-profile resolution, base-ref behavior, input coverage, failure semantics, and same-session findings payload validation.
  - Evidence: fake review-runner/review-log tests and command scenarios prove review-run and record-findings behavior without real model or Branch Memory mutation.

- [ ] Migrate or explicitly disposition GitHub findings publication.
  - Policy: steer first before changing publication semantics; ask before any live GitHub write validation.
  - Guidance: `exec publish-findings` is write-capable and currently uses a raw command surface. Decide whether command-face parity should convert it to an enveloped command now, preserve it as a hidden automation leaf, or defer raw-command remediation to CLI surface conformance. Keep publication fake-backed and guarded.
  - Evidence: a Semantic Update records the disposition; implementation tests cover fake GitHub publication or a parked follow-up names the owning Objective if not migrated here.

- [ ] Align public skills, Pi metadata, docs, and context over the Roaster Capability boundary.
  - Policy: direct execution after preview; steer first before changing public skill names or review terminology.
  - Guidance: update Roaster-related skills to point at the chosen SDL command face once parity exists, preserve skill names such as `roast-thermonuclear-review`, keep Pi metadata consistent, and refresh `ts/packages/roaster/CONTEXT.md`, SDL/root context as needed, and docs such as `docs/roaster-pierre-diffs.md` only when their boundary claims change.
  - Evidence: source searches show stale standalone-only wording is gone or intentionally retained; context/docs describe Command Face, Capability API, Domain Core, Branch Memory review logs, and publication boundary.

- [ ] Decide and execute standalone `roaster` binary cutover.
  - Policy: steer first if call-site inventory finds an external or repo-local compatibility reason to retain the binary; otherwise direct execution after preview once SDL parity evidence is present.
  - Guidance: classify every durable public `roaster` binary/shim/doc/test/skill reference as migrated, removed, or intentionally retained. If removing, do not leave a long-lived duplicate public implementation. If retaining temporarily, record the compatibility reason and follow-up.
  - Evidence: call-site inventory, package metadata/shim diffs, docs/skill updates, and tests proving the chosen command face covers the public lifecycle.

- [ ] Close out Roaster capability migration and update parent Objective.
  - Policy: direct execution after preview for Objective tracking and docs closeout.
  - Guidance: mark the child complete only when command/API/docs/storage evidence satisfies completion criteria, then update parent `sdl-extension-architecture` Phase 2 step 4 to record Roaster as completed.
  - Evidence: child closure records validation, compatibility caveats, parked follow-ups, and parent tracking update.

## Parked

- Dynamic arbitrary Pi mirroring for Roaster commands.
- Extension-owned skill/resource installation, update, or marketplace behavior.
- Changes to review-definition format, model-profile vocabulary, review-log Branch Memory namespace/key layout, or `@pierre/diffs` parser semantics.
- Automatic remediation, PR-addressing, or generated Graphite stack workflows; closed Roaster stack Objectives remain provenance unless a future Objective reopens that product direction.
- Live GitHub findings-publication smoke tests unless explicitly confirmed for a disposable/safe target.
