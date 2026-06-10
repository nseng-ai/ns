# Roadmap

## Work

- [ ] Build `@asdl/clinkr` v1 at `ts/packages/clinkr`.
  - `ClinkrExit` discriminated union (ok/negative/failure, exit codes 0/1/2), schema-first parameter generation from Zod request schemas, `--format human|json` dispatch with the Python-parity machine envelope, eager `--json-schema`, hidden `exec` subgroup support, generated help.
  - Evidence: unit tests covering each v1 feature pass.
- [ ] Pin current CLI behavior with scenario tests where coverage is missing.
  - Each of the four CLIs needs enough scenario coverage (flags, exit codes, output shapes, help invocations) that the migrations are behavior-preserving by evidence, not by inspection.
- [ ] Migrate `@asdl/plans` to clinkr.
  - First and smallest migration; deletes its hand-rolled parser and five help functions. Expect clinkr API corrections here — feed them back before the next migration.
- [ ] Migrate `@asdl/planned-branch` to clinkr.
- [ ] Migrate `asdl-dev` to clinkr.
  - Stress case for generated parsing: it is the only CLI supporting both `--flag=value` and `--flag value`; decide whether clinkr supports both syntaxes globally or normalizes.
- [ ] Migrate the `@asdl/pr-address` CLI shell to clinkr, preserving legacy-Python fallback dispatch.
  - Coordinate with `pr-address-typescript-port` and `pr-address-ts-thermo-review-followups`; this objective owns only the CLI shell, not operation semantics or Python retirement.
- [ ] Update the umbrella objective `port-asdl-toolkit-to-typescript`.
  - Progress its clinkr roadmap row, record `@asdl/clinkr` as the answer to its package-identity open question, and note ledger impact.

## Parked

- TS-native machine envelope redesign (explicitly deferred in favor of exact Python parity; revisit after migrations or on concrete consumer need).
- Python clinkr features without a current TS consumer: markdown renderers, command aliases, JSON-input loading, `Ensure`/`NonIdealState` idioms, context-factory machinery beyond what the four CLIs need.
- npm publication and public API commitment for `@asdl/clinkr`.
- Adopting clinkr in future capability ports (`brmem`, `handoff`, `objective`, …) — sequencing belongs to the umbrella objective.
