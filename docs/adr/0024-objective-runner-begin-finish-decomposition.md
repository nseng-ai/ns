# ADR 0024: Objective Runner Begin/Finish Workflow

## Status

Accepted

## Context

Autoobjective is ordinary, prose-only Objective whose roadmap and Runner Policy are shaped for repeated implementation steps. Not machine category, hidden queue, or unattended controller. Each step needs deterministic preconditions, verification, reviewable checkpoint; semantic judgment stays with parent LM.

Agent harness already owns child-session visibility, interruption, model policy, cost accounting. Objective CLI should not duplicate those by supervising child subprocess. Durable CLI role: deterministic work before and after one child session.

## Decision

One Objective Runner step is exactly this sequence:

1. Parent invokes `ns objective exec runner-begin <slug> ... --report-path <fresh-path>`. Begin checks preconditions, picks default or recovery mode, emits parent-held step facts plus child prompt.
2. Parent dispatches one harness subagent in same worktree with that prompt. Child implements one focused slice, leaves all repository changes uncommitted, writes validated JSON report outside repository.
3. Parent invokes `ns objective exec runner-finish <slug> --facts @<file>`. Finish validates facts and report fail-closed, verifies live repository state, returns one Runner Checkpoint. For ready slice, finish alone creates local provenance commit.

Begin needs fresh, non-repository report path for every default or recovery attempt. Finish takes begin's saved machine envelope or facts object, cross-checks slug, reads mode and dispatch baseline only from those facts. Child's chat response is not protocol artifact.

Verification gate checks report integrity, branch and Graphite invariants, non-empty cleanly applicable diff, unchanged HEAD. Child commit therefore fails verification. Successful runner-owned commit carries `Objective-Runner-Step: <slug>` and, for recovery, `Objective-Runner-Mode: recover` provenance trailers. Runner-attested facts and child-reported narrative stay distinct in checkpoint.

Step is local-only. Child cannot commit, push, publish, submit, merge, land, deploy, or mutate pull request. `runner-finish` is terminal for step, does not publish. Conditional parent-only publication is separate boundary governed by ADR 0037.

Parent judges whether to keep, recover, stop, ask human, continue, or record Semantic Update. Recovery is another explicitly initiated single attempt over dirty tree, not automatic supervisor. Each invocation does one judged step; neither CLI nor harness call holds hidden multi-step loop or cross-step state.

## Consequences

- Autoobjective stays execution-friendly prose, not Objective schema or lifecycle state.
- Harnesses own dispatch, progress, interruption, cost visibility; Objective package stays independent of Pi host.
- JSON reports are fresh payload artifacts validated at deterministic boundary, not prose scraped from chat.
- Parent-held facts are trust inputs; finish still attests only live repository facts. Changing baseline cannot make gate prove absent repository state.
- Stop, blocked, malformed-report, verification-failure, commit-failure paths are explicit. Failed verification leaves child's worktree for parent-initiated recovery.
- Semantic Updates stay parent judgment. Routine step summaries do not become Objective tracking automatically.

## Alternatives

- **CLI-supervised child session:** rejected: duplicates harness lifecycle, observability, routing, cost machinery.
- **Child commit or self-attestation:** rejected: collapses implementation and verification trust zones.
- **Unattended batch or automatic recovery loop:** rejected: parent must judge every checkpoint.
- **Report parsed from final chat prose:** rejected in favor of fresh, schema-validated artifact.
