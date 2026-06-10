# Roadmap

## Work

- [ ] Migrate `@asdl/planned-branch` to clinkr.
- [ ] Migrate `asdl-dev` to clinkr.
      Resolve the pi-ai streaming open question during this migration; if a streaming need appears, give it its own escape hatch rather than reshaping the renderer contract.
- [ ] Migrate the `@asdl/pr-address` CLI shell to clinkr, preserving legacy-Python fallback dispatch.
      Coordinate with `pr-address-typescript-port`; this record owns only the CLI shell, not operation semantics or Python retirement. Sequenced last among the migrations, after that record's payload-spec rows.
- [ ] Extract the shared git gateway into `@asdl/core` with real and in-memory implementations.
      One interface replacing the planned-branch/plans/asdl-dev gateways and the git methods in `pr-address/src/gateways.ts`; unify `sourceBranch`/`currentBranch` naming; delete `plans-git-adapter.ts`; consolidate the per-package in-memory git fakes.
- [ ] Decide and implement the payload/JSON-input home (clinkr first-class vs package-local).
      Recommendation: clinkr-first-class payload/reference support with pr-address as the proving consumer. Coordinate with `pr-address-typescript-port`'s payload-spec rows; final ownership of `loadOperationPayload` is this decision.
- [ ] Adopt Zod boundary validation in `plans`, `planned-branch`, and `asdl-dev`.
      Replace hand-rolled extractors (`requiredStringField`, `extractPlannedBranchEvidence`, `validateCheckpointMessage`, session-entry extraction) with Zod schemas.
- [ ] Give `asdl-dev` a declared public surface and end deep imports.
      Add `index.ts` plus an `exports` field sized to what `ccc`/`pi-extensions` actually consume, then migrate their `asdl-dev/src/*` deep imports (15+ files) onto it.
- [ ] Consolidate scenario-test scaffolding into `@asdl/clinkr/testing` plus a `@asdl/core` testing export.
      Shell-level helpers stay in `@asdl/clinkr/testing`; non-shell fixtures (async temp-dir fixture, node-runtime CLI smoke helper) get a `@asdl/core` testing export. Replace the quadruplicated node-runtime test and tripled temp-dir fixture. Coordinate with `pr-address-typescript-port`'s test-scaffolding row.
- [ ] Reconcile the umbrella `port-asdl-toolkit-to-typescript`.
      Update its scaffold/clinkr rows to reference this record and confirm the package-identity open question is recorded as resolved (`@asdl/clinkr` + `@asdl/core`).

## Parked

- Uniform envelope adoption, per-command negative/failure classification, and the Result-type migration — end-of-migration debt owned by the umbrella (`port-asdl-toolkit-to-typescript/migration-debt.md` entries 1–4), not work for this record.
- TS-native machine envelope redesign (umbrella `migration-debt.md` entry 3 governs revisit timing).
- npm publication and public API commitment for `@asdl/clinkr` and `@asdl/core`.
- Python clinkr features without a current TS consumer: markdown renderers, command aliases, `Ensure`/`NonIdealState` idioms, context-factory machinery beyond what the four CLIs need.
- Unifying domain-specific fakes beyond git (vercel, checkpoint, brmem, legacy pr-address gateways stay per-package).
- The `pi-extensions/planned-branch-extension.ts` workflow reimplementation (pi-only concern).
- Clinkr adoption in future capability ports (`brmem`, `handoff`, `objective`, …) — sequencing belongs to the umbrella objective.
