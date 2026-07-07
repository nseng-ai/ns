---
edges:
  - objective: flow-land-incremental-perf-rollout
    annotation: Gates the perf rollout; risky perf slices wait until this deepening lands its required candidates so primitive changes sit on a fake-testable, single-vocabulary land core.
---

# Flow Land Architecture Deepening

## Thesis

The flow-land subsystem (`ts/packages/capabilities/flow/src/land`, ~9,900 lines) has accumulated shallow modules and duplicated seams that make it fragile: a shadow plan type copied field-by-field from the Land Domain Core's Stack Landing Plan, the Land Gateway Set re-derived from the `LandRuntime` bag at five call sites, and a 952-line Graphite maintenance module threaded with nested context bags that is only testable through scripted-exec scenario transcripts. Recent flow-land bugs showed this shape is too fragile to absorb risky performance changes. This Objective deepens the land modules — one plan vocabulary, one gateway-set construction, maintenance expressed over the Land Gateway Set, consolidated presentation — so that behavior concentrates behind small interfaces, tests move onto in-memory fakes, and the paused `flow-land-incremental-perf-rollout` Objective can resume on a safer substrate.

Source: architecture review of `flow/src/land` (2026-07-07), which rated candidates 1–2 Strong, 3 Worth exploring, 4 Speculative.

## Scope

The four review candidates, sequenced so the earlier ones make the later ones mechanical:

1. **Collapse the dual landing-plan vocabulary.** `stack/landing-plan.ts` copies the domain Stack Landing Plan into a shadow `FlowLandingPlan` (`stack/types.ts`) via `toFlowLandingPlan`, `toFlowDescendantMaintenance`, and `copyPullRequestSnapshot`, renaming discriminants (`type`→`kind`) in flight. The seam is porous anyway — seven `stack/` files import functions and types from `../api.ts`. Delete the shadow type and mappers; `stack/` execution consumes the domain plan directly, keeping only `toLandStackFailure` where failure presentation genuinely differs.
2. **Build the Land Gateway Set once.** `createRuntimeLandContext(runtime)` is called at five sites (`landing-dispatch.ts:48`, `stack/landing-plan.ts:22`, `stack/landing-plan-execution.ts:64`, lazy `??=` at `stack/landing-coordination.ts:62`), so every phase's interface carries both the `LandRuntime` bag and the derived `LandContext`. Construct the adapter once at dispatch; thread only the gateway set, with host-only presentation calls behind a separate narrow interface.
3. **Deepen Graphite maintenance behind the Land Gateway Set.** `stack/graphite-maintenance.ts` (952 lines) mixes `landContext`/`runtime`/`ctx`/command options in nested `MaintenanceOperationContext` bags and is reachable only through 40+ scripted `FakePi` scenario transcripts. Express the maintenance phase purely over the Land Gateway Set plus a narrow progress interface, moving it toward the Land Domain Core per the Flow Land Compatibility Boundary; tests move onto the `testing.ts` in-memory fakes.
4. **Consolidate the three presentation modules.** `stack/presentation.ts` (518), `stack/land-presentation.ts` (137), and `land-matrix-progress.ts` (142) split plan/failure/progress formatting with no seam between them; fold into one presentation module with a small interface.

## Non-Goals

- Performance changes themselves — merge/push primitive replacements, GraphQL merge adoption, lease-based push, verification removal all remain owned by `flow-land-incremental-perf-rollout`.
- Changing subprocess command shapes, telemetry semantics, safety gates (strict PR/head checks, confirmations, backup refs, cleanup guards), or user-visible land behavior; this is structural deepening, not behavior change.
- Breaking the Flow Land Compatibility Boundary: CCC continues to enter through the Flow Capability API (`@nseng-ai/flow/api`); no existing `@nseng-ai/flow/api` exports are removed without a deliberate migration.
- Rewriting the scenario-test harness; existing scenario tests are the safety net and should survive candidates 1–2 essentially unchanged.

## Completion Criteria

- Candidates 1–3 are landed: the shadow `FlowLandingPlan` and its mappers are deleted, the Land Gateway Set is constructed once at dispatch and is the only capability bag crossing phase seams, and Graphite maintenance is expressed over the Land Gateway Set with maintenance tests running on in-memory fakes.
- Candidate 4 is dispositioned: either the consolidated presentation module is landed, or an explicit recorded decision not to do it (with rationale) exists in this record.
- Command shapes and telemetry are preserved throughout, with the fake-backed scenario counts in `land-stack-command-scenarios.test.ts` as evidence.
- `flow-land-incremental-perf-rollout` can be unblocked: its Blocked Sentence is cleared (via its own update) once the required candidates land.

## Assumptions and Risks

**Assumptions**

- The 40+ scenario tests in `land-stack-command-scenarios.test.ts` plus the sandbox/integration lanes are a sufficient safety net to refactor beneath without behavior drift; if a gap appears, the slice adds targeted coverage first.
- The `FlowLandingPlan`/`StackLandingPlan` translation carries no load-bearing semantics beyond the observed renames and warning flattening; if a genuine divergence surfaces, that field's translation stays deliberately rather than being deleted.
- Candidate 3 preserved subprocess command shapes and telemetry-facing scenario expectations while restructuring the module; the perf-rollout Objective's telemetry baselines (linear-11 = 145 calls, linear-25 = 313) remain valid comparison points.

**Risks**

- Candidate 3 touched the same surface the perf rollout will later modify, but the structural slice preserved scenario expectations and kept performance primitive changes out of scope. Remaining mitigation: coordinate Candidate 4 disposition and perf unblocking with the perf-rollout roadmap.
- Since `flow-land-incremental-perf-rollout` is now blocked on this Objective, stalling here stalls the perf work too; Candidate 4 disposition should stay narrow so the gate can clear promptly.
- Moving maintenance toward the Land Domain Core could tempt scope creep into a full land-execution migration; Candidate 3 resolved this pass by keeping executable orchestration under `stack/` and cleaning the seam around `LandContext` plus progress.

## Open Questions

- Resolved during Candidate 3: executable maintenance orchestration stays under `stack/` for this pass, re-expressed over `LandContext` plus a narrow progress interface rather than moved wholesale into the Land Domain Core.
- Whether candidate 4 is worth doing at all once 1–3 have reshaped the module map; closure accepts a recorded decision either way.
