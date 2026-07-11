# Decision: typed submit plan, unified progress, centralized body policy

**Accepted — 2026-07-10, @schrockn** (stack review of PR #3379, `flow-deepening-smush--03d-submit-architecture`).

## Decision

Flow submit is structured around three explicit seams instead of orchestration owning those concerns inline:

- a typed planning phase (`submit-plan.ts`): `buildSubmitPlan` captures submit scope, existing PR links, and metadata-prewrite eligibility before execution;
- one unified `SubmitProgress` interface (`submit-progress.ts`) with matrix and stream constructors, replacing separate phase/matrix wiring;
- a centralized PR-description body policy (`pr-description-body.ts`): managed-region markers, fingerprinting, `decidePrBodyUpdate`, and `mergeGeneratedBody` in one module.

## Rationale

Deterministic planning and a single body-policy authority make submit unit-testable and keep stream/matrix progress rendering consistent. The body-policy module is also the seam that preserves human-owned description sections (e.g. decisions logs) outside the managed region.

## Alternative rejected

Keep planning, progress wiring, and body policy inline in submit orchestration. Fewer modules, but planning stays untestable in isolation and body-update rules stay scattered.

## Consequences

- Submit executes from a `SubmitPlan`; behavior changes to scope or prewrite eligibility belong in planning, not execution.
- All PR body update decisions route through `pr-description-body.ts`; new description features (decisions-log awareness, smush-aware titles) should extend that policy layer.
