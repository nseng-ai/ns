# Decision: unified land failures, collapsed coordinator, one-way presentation imports

**Accepted — 2026-07-10, @schrockn** (stack review of PR #3380, `flow-deepening-smush--04d-land-architecture`).

## Decision

Flow land is rebuilt on three coupled commitments:

- one unified failure model in `land/stack/errors.ts` (`LandFlowFailure = LandingFailure | LandingExecutionFailure`, `landFlowFailureFacts` normalization, typed `LandStackResult`/`LandStackOutcome`) shared by boundary, domain, and execution paths;
- a single landing-execution coordinator (`land/landing-execution.ts` plus reusable preflight `StackLandingShape`), replacing the `landing-coordination` / `landing-plan-execution` / `landing-plan` chain;
- one-directional presentation imports: stack modules never import upward into `land-presentation.ts`, enforced by `test/unit/land-import-direction.test.ts`.

## Rationale

One failure model and outward-only reporting remove parallel failure vocabularies and upward dependencies, so presentation and routing decisions live in one place and the execution core stays reusable.

## Alternative rejected

Keep the coordinator chain and per-path failure models. Smaller diff, but correctness of failure routing would keep depending on multiple modules agreeing on parallel shapes.

## Consequences

- Serialized failure field names changed (`failedPrNumber`, `displayCommand`, `execResult`); external consumers of serialized failure objects must adapt.
- New land failure kinds extend the unified union in `land/stack/errors.ts`; new presentation goes in `land-presentation.ts`, never in stack modules.
