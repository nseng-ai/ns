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
- [x] Migrate `slot resize` command ownership in one PR. Runner checkpoint `dfc76b88ce5b98c99c7667a9a6dd0e5d5b3d3c89` colocated resize command assembly, removed its central registry entry, and moved resize scenarios to the production filesystem harness; focused Slot checks and full `just` validation passed.
- [x] Migrate `slot provision apply` command ownership in one PR. Runner checkpoint `32d952ccdbfc0e2803442d2c3ec899112a6960a5` colocated provision-apply command assembly, removed its central registry entry, and moved apply help and scenarios to the production filesystem harness; focused Slot checks and full `just` validation passed.
- [x] Migrate `slot provision import` command ownership in one PR. Runner checkpoint `39a505787d118a52c5ac693f5c6d3dff0a6d0b0e` colocated provision-import command assembly, removed its central registry entry, and moved import help and scenarios to the production filesystem harness; focused Slot checks and full `just` validation passed.
- [x] Migrate `slot gt up` command ownership in one PR. Runner checkpoint `f73b7780391f84cdf33afc9960044b34301d305b` colocated gt-up command assembly, removed its central registry entry, and moved help and behavior coverage to the production filesystem harness with Graphite fakes; focused Slot checks and full `just` validation passed.
- [x] Migrate `slot gt down` command ownership in one PR. Runner checkpoint `e090d0ef84a0cff3c75d6baeccb10cf6754124a6` colocated gt-down command assembly, removed its central registry entry, and moved help and behavior coverage to the production filesystem harness; focused Slot checks and full `just` validation passed.
- [x] Migrate `slot gt free-stack` command ownership in one PR. Runner checkpoint `f0835102bf50b7cae11a8d7e0f81780c45853a03` colocated free-stack command assembly, removed its central registry entry, and moved help and behavior scenarios to the production filesystem harness; focused Slot checks and full `just` validation passed.
- [x] Migrate `slot gt exec stack-branches` command ownership in one PR. Runner checkpoint `cee5c541e2e9d21a752cfc458569a08cf6769341` colocated stack-branches command assembly, removed its central registry entry, and moved help and behavior scenarios to the production filesystem harness; focused Slot checks and full `just` validation passed.
- [x] Migrate `slot gt exec stack-map-branches` command ownership in one PR. Runner checkpoint `2263e11aab1669e07ce77e05c11eb1e33422768c` colocated stack-map-branches command assembly, removed its central registry entry, and moved help and behavior scenarios to the production filesystem harness; focused Slot checks and full `just` validation passed.
- [x] Migrate `slot gt exec backup-refs` command ownership in one PR. Runner checkpoint `5ca558150fa96d37285e3866bc1799ce50139cda` colocated backup-refs command assembly, removed its central registry entry, and moved help and behavior scenarios to the production filesystem harness while preserving branch creation, rendering, usage-error, and failure behavior; focused Slot checks and full `just` validation passed.
- [x] Migrate `slot gt exec quiescence` command ownership in one PR. Runner checkpoint `d06a2531c33afa4c6489154f9e29a3bdd756211c` colocated quiescence command assembly, removed its central registry entry, and moved help and behavior scenarios to the production filesystem harness; focused Slot checks and full `just` validation passed.
- [x] Migrate `slot gt exec descendants-report` command ownership in one PR. Runner checkpoint `f686d2709ce7b070dc0232a9522b6c0341734315` colocated descendants-report command assembly, removed its central registry entry, and moved help and behavior scenarios to the production filesystem harness; focused Slot checks and full `just` validation passed.
- [x] Migrate `slot gt exec restack-preflight` command ownership in one PR. Runner checkpoint `a47c2cc0e99238626f23c375e567c4aec54939e0` colocated restack-preflight command assembly, removed its central registry entry and now-unused typed registry adapter, and moved help and behavior scenarios to the production filesystem harness; focused Slot checks and full `just` validation passed.
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
