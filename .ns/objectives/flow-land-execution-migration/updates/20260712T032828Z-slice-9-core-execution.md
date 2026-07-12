# Slice 9 core execution completed

## Summary

Completed Slice 9 by adding `src/land/execution/execute.ts` and making execute mode in the public Land Capability API run stack landing end to end over `LandContext`. `executeStackLandingPlan(context, host, plan, options)` now owns main-confirmation policy, managed-slot freeing, submit-required preparation and recheck, the merge/maintenance loop, and immutable result accumulation.

The host is `LandStackExecutionHost { confirmation: LandConfirmationGateway; progress: LandExecutionProgress }`. `executeLanding` accepts that host additively and defaults to `nullLandExecutionProgress` plus `nullLandConfirmationGateway`, so absent interactive approval refuses before mutation. Dry-run behavior remains unchanged. The execution result carries the ready plan, phase outcomes, landed PRs and chunks, warnings, retained-local-branch cleanup, and freed-slot cleanup; `LandingOutcome` receives real phases, chunks, and cleanup without changing its public shape.

Flow's `landing-execution.ts` is now a thin real-host/presentation adapter. It calls the core executor and presents returned landed/warning/cleanup values rather than mutating caller-owned `landed` and `warnings` arrays. `createFlowLandConfirmationGateway` handles the core `main-landing` request with the existing exact title, plan text, non-interactive wording, and confirmation evaluation point.

## Objective Impact

Slice 9 completes the roadmap's execution-ownership migration: stack mutation policy now runs in the Land Domain Core over semantic gateways and narrow host seams, while Flow retains parsing, adapter construction, dispatch ordering, live progress, and presentation. Independent parent validation is complete. The Objective remains open; this evidence update does not close it.

## Dispatch ordering and compatibility evidence

`landing-dispatch.ts` was not changed for Slice 9. Its locked ordering remains upfront confirmation, isolated-versus-stack routing, cleanup decision, stack execution, then post-landing cleanup. Stack dispatch still marks its upfront main confirmation approved before entering the core and passes pre-merge approval only at the existing evaluation point, avoiding duplicate prompts. The permanent 61-test scripted transcript suite passed unchanged in expectations and fixtures, and the focused post-landing/presentation tests passed.

The integration sandbox had four stale success assertions from Slice 8's canonical `LandOutcome` vocabulary migration; only those assertions were updated from `success` to `completed`. Command, gateway, notification, and safety assertions were unchanged. The full integration lane then passed.

CCC compatibility remains through the unchanged `@nseng-ai/flow/api` export path. Existing exports were retained; the core executor and its host/result types were added.

## Fake-driven execution evidence

`test/land/unit/execute.test.ts` adds six in-memory execution scenarios:

- linear single-path success through an explicit approving host, with real completed phases and a landed chunk;
- safe default-host non-interactive refusal before backup or merge mutation;
- submit-required preparation and residual metadata safety halt;
- managed-slot conflict freeing and `freedSlots` propagation;
- optional descendant maintenance warning aggregation;
- retained local-branch cleanup propagation.

The linear scenario cross-checks the semantic gateway request order and typed request objects against permanent transcript scenario `renders final landed PR numbers as terminal hyperlinks` in `test/unit/land-stack-command-scenarios.test.ts`. It does not reconstruct command strings; the permanent transcript remains command-shape authority.

## Boundary and stale sweeps

- Added `execution/execute.ts` to import-direction `MIGRATED_MODULES`.
- Added a recursive guard proving command execution calls remain in the adapter-family allowlist.
- `execution/execute.ts` imports no stack, Pi, renderer, command-stream, or kernel module.
- Source sweep is empty for the literal `merge execution remains in Flow`.
- The former Flow-owned pre-merge/merge composition and mutation out-parameters are gone; only the thin `runFlowStackLanding` adapter calls `executeStackLandingPlan`.

## Permanent invariant exception

The invariant diff remains exactly the already-authorized Slice 8 exception:

- `test/unit/land-stack-command-scenarios.test.ts`
- `test/unit/land-stack-topology-guards.test.ts`

Each still has exactly 2 insertions and 2 deletions, all import/type-only edits needed to delete `stack/errors.ts`. No Slice 9 edit touched either file, and the other four permanent fixture/support paths remain unchanged.

## Validation

- Focused execute/dispatch-presentation/import/transcript tests: 5 files, 91 tests passed.
- Full Flow package via `pnpm --dir ts --filter @nseng-ai/flow test`: 76 files, 675 tests passed.
- Full `just`: passed, including dprint, dependency checks, oxfmt, oxlint, tsgo, the TypeScript style guard (148 tests), default Vitest (510 files, 5,154 tests), and the Objective sweep (151 records, 0 errors and 0 warnings).
- `just ts-test-integration`: 40 files, 155 tests passed. This includes the entrypoint-level land sandbox lane and satisfies the plan's allowed final sandbox/dry-run behavioral-check alternative.
- The permanent scripted transcript suite within focused validation: 61 tests passed.
- `ns objective check flow-land-execution-migration`: passed with 0 errors and 0 warnings; the Objective remains open.
- Final stale symbol and literal sweeps passed.
- Final scope audit found changes only in Flow land implementation and tests, this new Objective, and the two user-authorized predecessor-edge frontmatters.

## Follow-Ups

Independent final validation is complete. The Objective remains open; deciding or performing Objective closure is outside this evidence update.
