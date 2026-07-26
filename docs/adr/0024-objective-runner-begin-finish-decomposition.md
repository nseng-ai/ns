# ADR 0024: Objective Runner Begin/Finish Workflow

## Status

Accepted

## Context

An Autoobjective is an ordinary, prose-only Objective whose roadmap and Runner Policy are shaped for repeated implementation steps. It is not a machine category, hidden queue, or unattended controller. Each step needs deterministic preconditions, verification, and a reviewable checkpoint while leaving semantic judgment with the parent LM.

The agent harness already owns child-session visibility, interruption, model policy, and cost accounting. The Objective CLI should not duplicate those facilities by supervising a child subprocess. Its durable role is the deterministic work before and after one child session.

## Decision

One Objective Runner step is exactly this sequence:

1. The parent invokes `ns objective exec runner-begin <slug> ... --report-path <fresh-path>`. Begin checks preconditions, selects default or recovery mode, and emits parent-held step facts plus the child prompt.
2. The parent dispatches one harness subagent in the same worktree with that prompt. The child implements one focused slice, leaves all repository changes uncommitted, and writes a validated JSON report outside the repository.
3. The parent invokes `ns objective exec runner-finish <slug> --facts @<file>`. Finish validates the facts and report fail-closed, verifies live repository state, and returns one Runner Checkpoint. For a ready slice it alone creates the local provenance commit.

Begin requires a fresh, non-repository report path for every default or recovery attempt. Finish accepts begin's saved machine envelope or facts object, cross-checks the slug, and takes mode and dispatch baseline only from those facts. The child's chat response is not a protocol artifact.

The verification gate checks report integrity, branch and Graphite invariants, a non-empty cleanly applicable diff, and unchanged HEAD. A child commit therefore fails verification. A successful runner-owned commit carries `Objective-Runner-Step: <slug>` and, for recovery, `Objective-Runner-Mode: recover` provenance trailers. Runner-attested facts and child-reported narrative remain distinct in the checkpoint.

A step is local-only. The child cannot commit, push, publish, submit, merge, land, deploy, or mutate a pull request. `runner-finish` is terminal for the step and does not publish. Conditional parent-only publication is a separate boundary governed by ADR 0037.

The parent judges whether to keep, recover, stop, ask the human, continue, or record a Semantic Update. Recovery is another explicitly initiated single attempt over the dirty tree, not an automatic supervisor. Each invocation performs one judged step; neither the CLI nor the harness call contains a hidden multi-step loop or cross-step state.

## Consequences

- Autoobjective remains execution-friendly prose rather than Objective schema or lifecycle state.
- Harnesses own dispatch, progress, interruption, and cost visibility; the Objective package remains independent of the Pi host.
- JSON reports are fresh payload artifacts validated at a deterministic boundary, not prose scraped from chat.
- Parent-held facts are trust inputs, but finish still attests only live repository facts; changing a baseline cannot make the gate prove repository state that is absent.
- Stop, blocked, malformed-report, verification-failure, and commit-failure paths are explicit. Failed verification leaves the child's worktree for parent-initiated recovery.
- Semantic Updates remain parent judgment. Routine step summaries do not become Objective tracking automatically.

## Alternatives

- **CLI-supervised child session:** rejected because it duplicates harness lifecycle, observability, routing, and cost machinery.
- **Child commit or self-attestation:** rejected because it collapses the implementation and verification trust zones.
- **Unattended batch or automatic recovery loop:** rejected because the parent must judge every checkpoint.
- **Report parsed from final chat prose:** rejected in favor of a fresh, schema-validated artifact.
