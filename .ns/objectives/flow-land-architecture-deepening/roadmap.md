# Roadmap

## Work

- [ ] Collapse the dual landing-plan vocabulary: delete `FlowLandingPlan`, `toFlowLandingPlan`, `toFlowDescendantMaintenance`, and `pull-request-snapshot.ts`; `stack/` execution consumes the Land Domain Core's Stack Landing Plan directly, retaining `toLandStackFailure` only where failure presentation genuinely differs.
  Evidence: existing land scenario and preflight tests pass unchanged; no user-visible output drift.
- [ ] Build the Land Gateway Set once: construct `LandContext` at `landing-dispatch.ts` and thread only it through plan/coordination/merge phases; retire the five `createRuntimeLandContext` call sites; host-only presentation calls move behind a separate narrow interface.
  Evidence: scenario tests pass; `createRuntimeLandContext` no longer re-derived per phase.
- [ ] Deepen Graphite maintenance behind the Land Gateway Set: re-express `stack/graphite-maintenance.ts` over `LandContext` plus a narrow progress interface, dissolving the nested `MaintenanceOperationContext` bags; maintenance tests move onto `testing.ts` in-memory fakes.
  Must preserve subprocess command shapes and telemetry exactly (perf-rollout baselines: linear-11 = 145 calls, linear-25 = 313); land as small revertible slices coordinated with the `flow-land-incremental-perf-rollout` roadmap.
- [ ] Disposition the presentation consolidation: either fold `stack/presentation.ts`, `stack/land-presentation.ts`, and `land-matrix-progress.ts` into one presentation module with a small interface, or record an explicit decision not to, with rationale.
- [ ] Unblock the perf rollout: once the required candidates land, clear `flow-land-incremental-perf-rollout`'s Blocked Sentence via its own update workflow and record the handback.

## Parked

(none)
