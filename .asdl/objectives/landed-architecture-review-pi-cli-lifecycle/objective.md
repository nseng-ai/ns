# Landed Architecture Review: Pi CLI Lifecycle

## Thesis

Pi slash-command execution should have a clear lifecycle interface: parse the slash-command input, validate command shape, wait for the harness to be ready when needed, ask for confirmation when a command requires it, run the CLI or command handler, surface live output, render the final result, restore usage-error invocations when helpful, and behave predictably in headless or UI-limited contexts.

The architecture-review value is to decide whether the current Pi CLI command lifecycle is already local and explicit enough, or whether it needs a harness-neutral seam before more `/code:*`, `/cmux:*`, planned-branch, grill, and source-control workflows depend on it. The Objective should leave behind either a small deepening change with tests or a durable parked rationale explaining why the current shape is acceptable.

## Scope

This Objective covers the Pi CLI command execution, rendering, and confirmation seam, starting from the current TypeScript surfaces:

- `ts/packages/pi-extensions/src/cli-command-extension.ts`, especially parsing, positional-argument rejection, idle waiting, run dependencies, confirmation wiring, live output handling, final output formatting/rendering, usage-error restoration, tracing, and headless behavior.
- `ts/packages/asdl-dev/src/submit.ts`, especially command-specific confirmation and source-control-adjacent CLI behavior that may reveal where lifecycle policy should stop and command policy should begin.
- Nearby Pi extension command handlers and tests only when they provide concrete evidence about the shared lifecycle shape, such as structured grill handling, planned-branch command rendering, or command-runtime behavior.

The expected pattern is: inventory the current lifecycle phases and tests, name the seam and its boundary, decide whether a harness-neutral lifecycle module/interface is warranted, then either implement a focused deepening slice or park the work with evidence.

## Non-Goals

- Do not redesign the Pi extension SDK, TUI framework, or provider/runtime architecture.
- Do not fold all command-specific product policy into a generic lifecycle module; command-specific confirmation language, mutation policy, and recovery semantics may remain with each command when that keeps behavior clearer.
- Do not turn this Objective into the broader source-control mutation UX review; shared submit/land-stack/cmux mutation policy belongs to `landed-architecture-review-source-control-mutation-ux` if that child is created.
- Do not change Objective, planned-branch, handoff, Branch Memory, or Graphite workflow semantics except as incidental callers that reveal the lifecycle boundary.
- Do not create hidden registries, task databases, command queues, lifecycle state machines, UUIDs, or YAML/frontmatter metadata.
- Do not perform branch creation, commits, Graphite operations, PR submission, publishing, deployment, or remote write operations unless a later explicit plan includes them.

## Completion Criteria

This Objective is complete when:

- the current Pi CLI lifecycle phases and their tests have been inventoried;
- the boundary between shared lifecycle behavior and command-specific policy has been named;
- either a focused lifecycle deepening change has landed with targeted tests, or a parked rationale explains why the current implementation is sufficiently local and explicit;
- confirmation, rendering, usage-error restoration, live-output, and headless behavior have been considered explicitly;
- any remaining broader source-control or command-policy questions are moved to the appropriate child Objective or parked with rationale.

## Assumptions and Risks

Assumptions:

- The Pi CLI lifecycle seam can be reviewed independently enough from source-control mutation UX to create useful local evidence.
- `ts/packages/pi-extensions/src/cli-command-extension.ts` is the primary shared lifecycle surface, while files such as `ts/packages/asdl-dev/src/submit.ts` are evidence-bearing consumers rather than automatic targets for consolidation.
- The right outcome may be either a small harness-neutral interface or an explicit decision to keep lifecycle behavior in the current module; implementation is not mandatory unless it improves locality or safety.
- Existing TypeScript tests around CLI command extension behavior, command runtime, grill UI, planned-branch extension, and submit behavior should be enough to validate a focused slice.

Risks:

- The review could drift into all Pi command UX or all source-control mutation policy; the mitigation is to keep this Objective anchored on execution/rendering/confirmation lifecycle phases.
- A generic lifecycle abstraction could hide command-specific safety policy; the mitigation is to name the boundary between lifecycle mechanics and command semantics before refactoring.
- The current implementation may have churned after the archived re-baseline; the mitigation is to re-read the concrete files and tests before naming the seam.
- Headless behavior and UI confirmation behavior may need different evidence; the mitigation is to include both in the inventory before deciding whether to change code.
- A narrow Markdown-only child Objective creation could accidentally pre-solve implementation details; the mitigation is to keep this record focused on scope, evidence standards, and first roadmap steps.

## Open Questions

- Should Pi command lifecycle behavior become a harness-neutral module/interface, or is `cli-command-extension.ts` already the right locality boundary?
- Which phases are truly shared lifecycle mechanics, and which belong to individual commands: confirmation text, mutation previews, usage-error restoration, live output, final rendering, or headless fallbacks?
- What is the smallest evidence standard for parking this cluster without creating a code change?
- Which tests best prove that confirmation, rendering, usage-error restoration, live output, and headless behavior remain safe after any deepening change?
