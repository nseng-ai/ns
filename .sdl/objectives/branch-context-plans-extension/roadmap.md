# Roadmap

## Work

- [ ] Inventory current branch-context/plans exports, consumers, and storage-sensitive semantics.
  - Evidence: package-root exports and consumer imports are grouped by command face, Peer API candidate, testing-only surface, and storage/compatibility-sensitive behavior. Current saved-plan path, Branch Memory namespace/key, branch naming, and attached-plan selection semantics are explicitly recorded before code migration begins.

- [ ] Define the combined Peer API boundaries and package export-map target.
  - Evidence: proposed `@sdl/branch-context/api` and `@sdl/plans/api` surfaces are documented with which sibling consumers need each symbol, which symbols remain command-face/private/testing-only, and which current root exports should not become peer contract.

- [ ] Extract or identify gateway-injected cores for saved-plan selection and branch-context attachment workflows.
  - Evidence: domain functions can be exercised with injected gateways/fakes without raw Pi/SDL host context, while command faces remain thin adapters that build gateways and present output.

- [ ] Migrate one `ccc` saved-plan dispatch/branch-context launch path to the curated Peer APIs.
  - Evidence: `ccc` no longer imports broad branch-context/plans roots for that path, behavior is preserved by targeted tests, and no human-facing CLI output is parsed for machine decisions.

- [ ] Migrate Pi branch-context/enriched-plan adapters to the curated seams where they need in-process capability behavior.
  - Evidence: Pi adapters retain presentation ownership while delegating branch-context/plans behavior through Peer APIs or command faces as appropriate; existing Pi tests cover unchanged user-visible command behavior.

- [ ] Retire obsolete broad/deep sibling imports and record the final boundary.
  - Evidence: import-boundary searches show sibling packages use Peer API subpaths or allowed testing surfaces; package docs/context and Objective updates capture the final branch-context/plans/ccc/pi-extension dependency stance.

## Parked

- Dynamic arbitrary Pi mirroring for branch-context/plans commands.
- Renaming existing user-facing `/sdl:plan:*`, branch-context, or dispatch-plan commands.
- Changing local plan-store layout, Branch Memory namespaces/keys, branch naming, or slug derivation compatibility.
- Converting `ccc` itself into the orchestrator extension; this remains in the parent Objective after dependent Peer APIs exist.
