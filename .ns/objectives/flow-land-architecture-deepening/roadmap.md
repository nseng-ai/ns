# Roadmap

## Work

- [x] Collapse the dual landing-plan vocabulary: delete `FlowLandingPlan`, `toFlowLandingPlan`, `toFlowDescendantMaintenance`, and `pull-request-snapshot.ts`; `stack/` execution consumes the Land Domain Core's Stack Landing Plan directly, retaining `toLandStackFailure` only where failure presentation genuinely differs.
      Evidence: stale-symbol sweeps for the shadow plan/mappers are clean; `just ts-check`; `pnpm --dir ts --filter @nseng-ai/flow test` (53 files, 482 tests); `land-stack-command-scenarios.test.ts` expectations were not edited.
- [x] Build the Land Gateway Set once: construct `LandContext` at runtime setup and thread it through plan/coordination/merge phases; retire the five `createRuntimeLandContext` call sites; host-only presentation calls remain as Candidate 3 input where they still need runtime seams.
      Evidence: stale-symbol sweeps for `createRuntimeLandContext` and `ReturnType<typeof createRuntimeLandContext>` are clean; `just ts-check`; `pnpm --dir ts --filter @nseng-ai/flow test` (53 files, 482 tests); Graphite override injection now occurs before `LandContext` construction.
- [x] Deepen Graphite maintenance behind the Land Gateway Set: re-express `stack/graphite-maintenance.ts` over `LandContext` plus a narrow progress interface, dissolving the nested `MaintenanceOperationContext` bags; maintenance tests move onto `testing.ts` in-memory fakes.
      Evidence: stale-symbol sweep for the retired runtime/context/stack helper couplings is clean; `performGraphiteMaintenance` call sites are limited to `landing-operations.ts` plus fake-backed unit tests; `just ts-check`; `pnpm --dir ts --filter @nseng-ai/flow test` (54 files, 485 tests). The executable orchestration remains under `stack/` for this pass while host presentation adaptation lives in `landing-operations.ts`.
- [x] Disposition the presentation consolidation: either fold `stack/presentation.ts`, `stack/land-presentation.ts`, and `land-matrix-progress.ts` into one presentation module with a small interface, or record an explicit decision not to, with rationale.
      Evidence: consolidated into root module `src/land/land-presentation.ts` (820 lines) covering result blocks/confirmation rendering, plan/warning/failure/success formatting, presentation/notification helpers, and live matrix progress; the three split modules are deleted and the stale-import sweep is clean (only a header comment mentions the old paths); `just ts-check`; `pnpm --dir ts --filter @nseng-ai/flow test` (54 files, 485 tests) with no test expectation edits, so command output and progress behavior are preserved.
- [x] Unblock the perf rollout: once the required candidates land, clear `flow-land-incremental-perf-rollout`'s Blocked Sentence via its own update workflow and record the handback.
      Evidence: objective-refresh removed the mirrored hard-gate edge and cleared the perf rollout Blocked Sentence on this branch after Candidates 1–3 were verified complete; PR #3178 is open with CI checks passing.

## Parked

(none)
