# All Thermo Followups

## Thesis

The Thermo Council report on the current flow/clinkr/objective rendering work should be converted into finished remediation, not left as review prose. The work succeeds when hosted Pi command output derives terminal capabilities from the command IO context instead of global `process.*`, flow streams always clean up cursor/sink state on failure, the non-TTY presentation contract is explicit, disposable scratch code is gone, and the phase-stream/test follow-ups are resolved in the priority order recommended by the council.

## Scope

- Fix the capability-resolution seam for flow streaming and objective list rendering so `Caps` come from the command host/render context, with process-global fallback only for direct terminal CLI execution.
- Guarantee phase-stream lifecycle cleanup for `flow submit` and `flow cp` failures, including cursor restore and sink shutdown through a `finally`-owned helper or equivalent temporary guard.
- Make and codify the non-TTY title/header behavior decision, preferring minimal append-only output unless implementation evidence shows a title line is required.
- Remove or archive `ts/scratch/cli-northstar` while preserving any durable design decisions in objective/design notes if they are still needed.
- Refactor `phase-stream.ts` after the functional fixes: separate lifecycle, phase state, transcript/tail buffering, and TTY/non-TTY rendering strategy; consolidate duplicated checkpoint phase specs where practical.
- De-brittle flow command tests so command scenarios assert event semantics and clinkr/theme tests own exact glyph/color/spacing formatting.
- Keep lower-priority Thermo notes visible as parked follow-ups unless the implementation touches the relevant seam.

## Non-Goals

- Do not add a separate `/thermo-council` product feature for stateful follow-up review rounds under this Objective.
- Do not make Thermo Council reports durable repo artifacts or Branch Memory entries as part of this remediation.
- Do not redesign the whole clinkr rendering system beyond the seams needed to resolve the report findings.
- Do not add a standing Runner Policy or cross-cutting `orientation.md`; this is a bounded remediation bundle that `objective-stack-impl` should execute only through its normal preview-and-confirm stack workflow.

## Completion Criteria

- Flow and objective command rendering use a shared, host-aware capability policy; callback/override sinks default to settled non-interactive caps with no ANSI/cursor control leakage.
- Flow stream startup/shutdown is owned by a helper or guarded callsite pattern that restores cursor/sink state when submit/cp work throws.
- Non-TTY title/header behavior is explicitly chosen and reflected consistently in tests.
- `ts/scratch/cli-northstar` is deleted or intentionally archived outside live source, with any retained rationale moved to durable prose.
- `phase-stream.ts` no longer carries the current combined lifecycle/state/tailing/rendering responsibilities in one growing module, and submit/cp share checkpoint definitions where appropriate.
- Flow command tests are less coupled to exact theme formatting; exact formatting coverage lives in clinkr/theme tests.
- Relevant targeted validation for flow, objective, and clinkr passes, with validation evidence recorded in later updates or closure prose rather than as a standalone roadmap row.

## Assumptions and Risks

Assumptions:

- The Thermo Council findings are directionally correct: the main functional risk is process-global capability resolution bypassing the Pi host IO seam.
- `SdlExtensionApi` command context and/or existing render context can provide enough information to distinguish direct terminal CLI execution from callback/override sinks.
- Minimal non-TTY append-only output is acceptable unless product evidence from Pi callback UIs says a first title line is required.
- The scratch north-star harness is disposable and not a runtime dependency; any useful ideas can be preserved as prose instead of live code.

Risks:

- Capability resolution was de-risked for flow streaming and objective list rendering by a shared `@sdl/clinkr` settled non-interactive caps policy plus host/IO-threaded caps; watch future commands for reintroducing process-global rendering decisions.
- Stream cleanup was de-risked for `flow submit` and `flow cp` by `runPhaseStream(...)` finally-owned cleanup; future stream changes should preserve that ownership boundary.
- Refactoring `phase-stream.ts` is now safer after the caps/cleanup fixes, but the remaining split should still avoid obscuring functional behavior.
- Exact-frame command tests may reject legitimate theme changes unless rendering semantics are separated from command behavior assertions.
- Removing scratch code without preserving still-relevant design rationale could lose context for future UI work.

## Implementation Guidance

`objective-stack-impl` should treat this Objective as executable with the normal parent-preview workflow. A good default stack is three independently reviewable slices: first fix hosted caps plus stream cleanup/non-TTY contract, then remove scratch code and split phase-stream responsibilities, then de-brittle command tests and decide whether parked import-boundary/destination-policy follow-ups should move into scope. Stop and re-preview if the first slice reveals that capability resolution needs a broader host API change than expected.

Prefer the shared capability policy in `@sdl/clinkr` when it can remain backend-neutral. If host-specific command context is required, keep clinkr's primitive policy small and put the SDL/Pi adapter at the command host seam rather than letting flow/objective commands read global `process.*` directly.

## Open Questions

None that should block stack execution. The non-TTY default is minimal append-only output; intentionally emitting a title/header line should require implementation evidence from Pi callback/widget behavior and should be recorded as an Objective update if chosen.
