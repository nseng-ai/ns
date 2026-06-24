# Roadmap

## Work

- [x] Inventory current branch-context/plans exports, consumers, and storage-sensitive semantics.
  - Evidence: `objective.md` now records broad root exports, absent Peer API subpaths, likely command/private surfaces, likely Peer API candidates, key `ccc` and Pi consumers, testing-only imports, and storage/compatibility-sensitive semantics for saved-plan paths, Branch Memory namespace/key, branch naming, slug derivation, and attached-plan selection. See `updates/2026-06-24-134905-inventory-baseline.md`.

- [x] Define the combined Peer API boundaries and package export-map target.
  - Evidence: `@sdl/branch-context/api` and `@sdl/plans/api` now exist as additive package export-map subpaths for the `ccc` dispatch-plan proof path, with root exports preserved and exclusions recorded. See `updates/2026-06-24-141357-peer-api-proof-path.md`.

- [ ] Extract or identify gateway-injected cores for saved-plan selection and branch-context attachment workflows.
  - Evidence: domain functions can be exercised with injected gateways/fakes without raw Pi/SDL host context, while command faces remain thin adapters that build gateways and present output.

- [x] Migrate one `ccc` saved-plan dispatch/branch-context launch path to the curated Peer APIs.
  - Evidence: `ts/packages/ccc/src/cmux/slot-dispatch-plan.ts` now imports branch-context/plans behavior from `@sdl/branch-context/api` and `@sdl/plans/api`, with targeted `@sdl/ccc` checks/tests passing and no human-facing CLI output parsed for machine decisions. See `updates/2026-06-24-141357-peer-api-proof-path.md`.

- [ ] Migrate Pi branch-context/enriched-plan adapters to the curated seams where they need in-process capability behavior.
  - Evidence: Pi adapters retain presentation ownership while delegating branch-context/plans behavior through Peer APIs or command faces as appropriate; existing Pi tests cover unchanged user-visible command behavior.

- [ ] Retire obsolete broad/deep sibling imports and record the final boundary.
  - Evidence: import-boundary searches show sibling packages use Peer API subpaths or allowed testing surfaces; package docs/context and Objective updates capture the final branch-context/plans/ccc/pi-extension dependency stance.

## Parked

- Dynamic arbitrary Pi mirroring for branch-context/plans commands.
- Renaming existing user-facing `/sdl:plan:*`, branch-context, or dispatch-plan commands.
- Changing local plan-store layout, Branch Memory namespaces/keys, branch naming, or slug derivation compatibility.
- Converting `ccc` itself into the orchestrator extension; this remains in the parent Objective after dependent Peer APIs exist.
