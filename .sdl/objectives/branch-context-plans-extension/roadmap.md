# Roadmap

## Work

- [x] Inventory current branch-context/plans exports, consumers, and storage-sensitive semantics.
  - Evidence: `objective.md` now records broad root exports, absent Peer API subpaths, likely command/private surfaces, likely Peer API candidates, key `ccc` and Pi consumers, testing-only imports, and storage/compatibility-sensitive semantics for saved-plan paths, Branch Memory namespace/key, branch naming, slug derivation, and attached-plan selection. See `updates/2026-06-24-134905-inventory-baseline.md`.

- [x] Define the combined Peer API boundaries and package export-map target.
  - Evidence: `@sdl/branch-context/api` and `@sdl/plans/api` now exist as additive package export-map subpaths for the `ccc` dispatch-plan proof path, with root exports preserved and exclusions recorded. See `updates/2026-06-24-141357-peer-api-proof-path.md`.

- [x] Extract or identify gateway-injected cores for saved-plan selection and branch-context attachment workflows.
  - Evidence: `@sdl/plans` saved-plan parsing/validation/latest-selection functions are identified as existing Plans Core over path/evidence inputs and injected Git-backed plan-store options; `@sdl/branch-context` now has a resolved-source Branch Context Core exercised with injected Git/Branch Memory/Graphite fakes. Package context docs record the command-face / Peer API / core boundary. See `updates/2026-06-24-143347-gateway-core-seam-map.md`.

- [x] Migrate one `ccc` saved-plan dispatch/branch-context launch path to the curated Peer APIs.
  - Evidence: `ts/packages/ccc/src/cmux/slot-dispatch-plan.ts` now imports branch-context/plans behavior from `@sdl/branch-context/api` and `@sdl/plans/api`, with targeted `@sdl/ccc` checks/tests passing and no human-facing CLI output parsed for machine decisions. See `updates/2026-06-24-141357-peer-api-proof-path.md`.

- [x] Migrate Pi branch-context/enriched-plan adapters to the curated seams where they need in-process capability behavior.
  - Evidence: Pi adapter source now imports branch-context/plans behavior from `@sdl/branch-context/api` and `@sdl/plans/api`, while implementation command names come from `@sdl/pi-command-surfaces` and Pi presentation ownership is preserved. See `updates/2026-06-24-150630-pi-adapter-peer-api-migration.md`.

- [~] Retire obsolete broad/deep sibling imports and record the final boundary.
  - Evidence so far: `ccc` source imports in `branch-context-up-and-impl.ts` and `cmux/slot-open-branch.ts` now use `@sdl/branch-context/api`, and the Peer API exports `findLatestBranchContextEvidence` for the inferred-branch path. Source import-boundary search over `ts/packages/ccc/src`, `ts/packages/pi-extensions/src`, and `ts/packages/extensions` shows no remaining broad `@sdl/branch-context` or `@sdl/plans` source imports. Validation passed for `@sdl/branch-context` check, `@sdl/ccc` check, and `@sdl/ccc` tests. Remaining: decide whether broad test imports are allowed public-surface coverage or should be migrated, then record the final branch-context/plans/ccc/pi-extension dependency stance in package docs/context and Objective tracking.

## Parked

- Dynamic arbitrary Pi mirroring for branch-context/plans commands.
- Renaming existing user-facing `/sdl:plan:*`, branch-context, or dispatch-plan commands.
- Changing local plan-store layout, Branch Memory namespaces/keys, branch naming, or slug derivation compatibility.
- Converting `ccc` itself into the orchestrator extension; this remains in the parent Objective after dependent Peer APIs exist.
