# Agent Context Economy

Authoritative planning artifacts are evidence caches, not invitations to rediscover the same facts. Reusing their versioned findings preserves a trust-nothing posture while avoiding repeated research, broad reconnaissance, and duplicate parent/subagent reads.

## Authoritative artifacts

A plan, handoff, or other artifact supplies inherited evidence when the workflow designates it authoritative and it carries usable provenance and verification anchors, such as:

- versioned source findings;
- file and symbol maps;
- current-state excerpts; and
- explicit revalidation anchors.

Harness and repository instructions still take precedence. An old-format or anchor-less artifact follows its workflow's existing behavior rather than gaining an implied verification contract.

## Classify the evidence

- **Inherited evidence:** stable findings, source research, file and symbol maps, and current-state descriptions supported by the artifact's provenance and anchors.
- **Volatile evidence:** external or checkout-dependent state that may have changed, including branch identity, PR checks, review threads, and dependency versions whose behavior the work relies on.
- **Missing evidence:** material questions the artifact leaves unresolved or concrete questions that focused implementation reveals.

Subagent findings also become inherited evidence for the rest of the session.

## Revalidation

Start verification from the artifact's supplied anchors. Revalidate only:

1. volatile state relevant to the task;
2. explicit source, excerpt, and symbol anchors identified by the artifact;
3. facts contradicted by an anchor check, the current checkout, validation, or implementation findings; and
4. material questions the artifact explicitly leaves unresolved.

Do not repeat stable upstream research, broad codebase reconnaissance, documentation reading, or explorer mapping already captured by the artifact.

Evidence inheritance governs the breadth of re-research, not whether required anchors are checked. It never weakens workflow STOP semantics: when a branch-context contract says an excerpt or anchor mismatch is a STOP, it remains a STOP.

## Named-trigger expansion

Expand beyond inherited evidence only when one of these triggers applies:

- an anchor has drifted;
- the artifact is ambiguous, incomplete, or internally inconsistent;
- focused implementation reveals a concrete unanswered question; or
- independent verification is required at a security, data-loss, or compatibility boundary.

State the specific trigger before expanding and scope the new investigation to that trigger.

## Reconnaissance and subagents

- Do not dispatch explorers to re-map a file or symbol inventory an authoritative artifact already supplies. When an explorer is still needed, give it a stated unanswered question.
- After an explorer or task subagent returns, open only the files and ranges needed to verify or act on its findings. Do not repeat the child's scan in the parent.
- Treat the subagent's findings as evidence for subsequent work unless later checks contradict them.
- Slice-in-subagent execution, including objective-runner and autorun workflows, is an existing context-management mechanism that this policy complements; this convention does not redesign those workflows.

## Related work

[`docs/follow-ups/delegation-first-parent-orchestration.md`](../follow-ups/delegation-first-parent-orchestration.md) records related measured work on keeping raw repository output out of the parent context. It is a follow-up note, not adopted doctrine.
