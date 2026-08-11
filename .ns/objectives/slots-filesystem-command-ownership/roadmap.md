# Roadmap

## Work

Phase rule: migrate one command per PR in each applicable phase. `list` owns the `ls` alias and `checkout` owns `co`; aliases do not receive separate PRs. Shared prerequisite/cutover PRs are allowed only where work cannot truthfully belong to one command, and must not batch command migrations.

### Phase 1 — Filesystem Command Ownership

- [x] Land the shared phase-1 prerequisite PR: establish the production filesystem-path scenario/completion harness with injected fake gateways and add the route-neutral context/completion/temporary-outcome adapter. Do not migrate a command in this PR. Runner checkpoint `9b664a835146c47d380fd726acd689530f2ad923` established the fake-driven production filesystem scenario/completion harness and extracted the route-neutral adapter; focused Slot typecheck and all 355 Slot tests passed.
- [x] Migrate `slot list` command ownership in one PR, retaining `ls` only as filesystem metadata. Runner checkpoint `5a7e455ad80fe1da4de710b1f4c8f122ba3b76ed` colocated the typed command assembly and moved list behavior coverage to the production filesystem harness; focused Slot typecheck and all 355 Slot tests passed.
- [x] Migrate `slot checkout` command ownership and completion wiring in one PR, retaining `co` only as filesystem metadata. Runner checkpoint `ece521dcdf4a9d15e853fa9976a769f92e8a69eb` colocated checkout command assembly and completion wiring, retained `co` only as route metadata, and moved affected scenarios to the production filesystem harness; focused Slot checks, all 355 Slot tests, and full `just` validation passed.
- [x] Migrate `slot goto` command ownership in one PR. Runner checkpoint `db958c2157a1e5b8dbbc3dfbd786bf03d1d84a6e` colocated goto command assembly, removed its central registry entry, and moved scenarios to the production filesystem harness while preserving output-format, clipboard, and shell-directive behavior; focused Slot checks and full `just` validation passed.
- [x] Migrate `slot claim` command ownership in one PR. Runner checkpoint `7a2769ef3a4fa36dc10d7c7f819330e1930d6bc5` colocated claim command assembly, removed its central registry entry, and moved claim behavior and affected provisioning scenarios to the production filesystem harness; focused Slot checks and full `just` validation passed.
- [x] Migrate `slot free` command ownership in one PR. Runner checkpoint `939f7322ff1019e287d08d5435d5e62ccc5ffa92` colocated free command assembly, removed its central registry entry, and moved scenarios to the production filesystem harness while preserving interactive input and legacy negative rendering; focused Slot checks and full `just` validation passed.
- [x] Migrate `slot foreach` command ownership in one PR. Runner checkpoint `7586f28a1c170b00821f392de422d4f818568913` colocated foreach command assembly, removed its central registry entry, and moved scenarios to the production filesystem harness with an injected fake command gateway; focused Slot checks and full `just` validation passed.
- [x] Migrate `slot gc` command ownership in one PR. Runner checkpoint `b0d9bf32cca8d6810faa1752d8a11d0ffd35bab6` colocated gc command assembly, removed its central registry entry, and moved all gc scenarios to the production filesystem harness; focused Slot checks and a clean full `just` rerun passed.
- [x] Migrate `slot init` command ownership in one PR. Runner checkpoint `4429fe0d2b709ae1329076afd4dbb841acaf40ff` colocated init command assembly, removed its central registry entry, and moved init and affected provisioning scenarios to the production filesystem harness; focused Slot checks and full `just` validation passed.
- [ ] Migrate `slot resize` command ownership in one PR.
- [ ] Migrate `slot provision apply` command ownership in one PR.
- [ ] Migrate `slot provision import` command ownership in one PR.
- [ ] Migrate `slot gt up` command ownership in one PR.
- [ ] Migrate `slot gt down` command ownership in one PR.
- [ ] Migrate `slot gt free-stack` command ownership in one PR.
- [ ] Migrate `slot gt exec stack-branches` command ownership in one PR.
- [ ] Migrate `slot gt exec stack-map-branches` command ownership in one PR.
- [ ] Migrate `slot gt exec backup-refs` command ownership in one PR.
- [ ] Migrate `slot gt exec quiescence` command ownership in one PR.
- [ ] Migrate `slot gt exec descendants-report` command ownership in one PR.
- [ ] Migrate `slot gt exec restack-preflight` command ownership in one PR.
- [ ] Migrate `slot shell show` command ownership in one PR; preserve its already-modern outcome behavior.
- [ ] Migrate `slot shell install` command ownership in one PR; preserve its already-modern outcome and interaction behavior.
- [ ] Land the phase-1 cutover PR after every command PR: delete the central spec registry, name-based loader, shared shell command array, legacy programmatic command face, `./command-face` package export, duplicate topology, and obsolete alias definitions. Evidence: production-path scenarios and completion tests preserve observable behavior, and relevant checks pass.

### Phase 2 — Modern Command Outcomes

Begin only after the phase-1 cutover and parity gate have landed. Each row is one command PR; do not batch commands. Shell commands are absent because they already return modern SDK outcomes.

- [ ] Modernize `slot list` outcomes in one PR.
- [ ] Modernize `slot checkout` outcomes in one PR.
- [ ] Modernize `slot goto` outcomes in one PR.
- [ ] Modernize `slot claim` outcomes in one PR.
- [ ] Modernize `slot free` outcomes in one PR.
- [ ] Modernize `slot foreach` outcomes in one PR.
- [ ] Modernize `slot gc` outcomes in one PR.
- [ ] Modernize `slot init` outcomes in one PR.
- [ ] Modernize `slot resize` outcomes in one PR.
- [ ] Modernize `slot provision apply` outcomes in one PR.
- [ ] Modernize `slot provision import` outcomes in one PR.
- [ ] Modernize `slot gt up` outcomes in one PR.
- [ ] Modernize `slot gt down` outcomes in one PR.
- [ ] Modernize `slot gt free-stack` outcomes in one PR.
- [ ] Modernize `slot gt exec stack-branches` outcomes in one PR.
- [ ] Modernize `slot gt exec stack-map-branches` outcomes in one PR.
- [ ] Modernize `slot gt exec backup-refs` outcomes in one PR.
- [ ] Modernize `slot gt exec quiescence` outcomes in one PR.
- [ ] Modernize `slot gt exec descendants-report` outcomes in one PR.
- [ ] Modernize `slot gt exec restack-preflight` outcomes in one PR.
- [ ] Land the phase-2 cleanup PR after every applicable command PR: delete temporary legacy-to-modern translation and remove obsolete legacy Clinkr command dependencies and unnecessary render-capability adaptation. Evidence: focused Slot tests and relevant TypeScript/package/repository checks pass with no behavior-contract changes.

### Closure Evidence

- [ ] Resolve from implementation facts whether selected-only import proof or packed-package inventory is warranted, and whether any remaining legacy rendering imports are legitimate presentation dependencies outside this Objective. Add only the necessary evidence or cleanup PRs; do not fold command migrations into them.

## Parked

- Moving reusable lifecycle operations, schemas, and renderers wholesale into filesystem route modules.
- Neutral Slot domain-result redesign between operations and commands.
- Changes to `@nseng-ai/slots/api`, `createSlotClient()`, or the checkout result contract beyond forced compatibility adjustments.
- Unrelated Slot CLI redesign or broader package architecture cleanup.
