# ADR 0022: Autoobjective prose pattern and Objective Runner step workflow

## Status

Accepted

## Context

Dogfooding `/objective:autopilot` showed that a deterministic multi-iteration loop can safely run child sessions, verify repository state, and commit slices, but it leaves the parent LM mostly observing a batch controller. That loses the intended parent-session judgment between Objective implementation slices: whether the last child advanced the roadmap, whether to update Objective tracking, whether to ask the human, whether to continue, and how to carry cross-session context.

At the same time, Objectives must remain durable narrative roadmap records, not workflow controllers, hidden task databases, or new machine state categories. Pi should be presentation/runtime, not the canonical home for portable workflow policy. The Objective package can own Objective-centric runner semantics only if the implementation stays gateway-injected and avoids depending on the Pi host or broad orchestration internals.

## Decision

Adopt **Autoobjective** as a prose-only Objective pattern: an ordinary Objective whose roadmap and runner policy are intentionally shaped for repeated Objective Runner steps with parent-LM checkpoints between committed slices. Autoobjective is not a machine category, Objective status, hidden queue, or unattended batch controller.

Adopt **Objective Runner** as the portable Objective-owned workflow core for one implementation step. The Objective package owns the runner policy, internal typed facts, and parent-facing Markdown checkpoint contract behind narrow injected runner gateways. CLI/Pi edges provide concrete operations such as child dispatch, Branch Context/Graphite interaction, Git commit mechanics, and any host presentation; the Objective core must not import the Pi host.

An Objective Runner step:

- runs one focused child implementation slice;
- verifies live repository facts deterministically;
- may use a narrow automatic LM recovery supervisor for local-consistency recovery only;
- creates a local commit when verification succeeds;
- returns a concise Markdown checkpoint to the parent LM;
- stops after the commit so the parent LM decides whether to continue, update Objective tracking, ask the human, or take another action;
- never submits, pushes, merges, publishes, or runs an unattended multi-step batch in the initial design.

Semantic Updates are written only when the parent checkpoint identifies material Objective impact: meaningful progress, decisions, risks, blockers, assumption changes, plan changes, or completion evidence. Routine step summaries are not Objective updates.

## Why

This keeps deterministic tooling as the substrate while restoring the parent LM as the semantic orchestrator. The automatic commit gives each step a reviewable unit, but the mandatory checkpoint prevents the old deterministic batch loop from becoming the workflow driver. Markdown checkpoints keep the parent-facing contract narrative and LM-friendly, while typed internal facts keep the runner testable without committing to a public JSON workflow state.

Placing the runner core in the Objective capability matches the user-facing domain while preserving the existing dependency boundary through injected gateways. Recording Autoobjective as a prose pattern preserves Objective ontology: the record stays an Objective, and execution-friendliness remains prose, not a new status or hidden state machine.

## Consequences

- The existing Pi-only `/objective:autopilot` implementation should be treated as legacy/prototype behavior, not the durable design center.
- Durable command vocabulary should distinguish the record pattern from the action: Autoobjective names the prose pattern; Objective Runner step names the workflow action.
- Batch mode is out of scope for the first durable design. If it returns later, it must be explicit lower-agency behavior, not the default path.
- The automatic LM recovery supervisor must remain narrower than the parent LM: no feature implementation, no commits, no HEAD changes, no submit/push/merge, no restack, and no next-strategy decisions.
- Parent sessions remain responsible for deciding whether and when to write material Objective Semantic Updates after a checkpoint.
