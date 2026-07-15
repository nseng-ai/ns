# ADR 0032: Unify subagent tool and runtime selection

## Status

Accepted

This ADR partly supersedes the model-visible-tool consequence of ADR 0023. The runner-subagent subprocess and protocol substrate from that decision remains current.

## Context

Pi delegation grew as two separately registered tools: `explore` for bounded read-only scouting and `forked_pi_agent` for one focused general task. Each tool mixed two independent decisions: the behavioral policy assigned to the child and the architecture used to execute the child. Adding another policy would have added another model-visible tool and another copy of registration, dispatch, progress, and result behavior.

The package also has two useful execution architectures. Subprocess children provide isolation and remain the established default. The pinned Pi SDK can run a real child session in-process, which is useful when a caller explicitly accepts same-process execution. Neither architecture should determine the child's permissions, prompt policy, model policy, batching, or result limits.

## Decision

Register one model-visible Pi tool named `subagent`. Its stable input chooses an agent type, one or more tasks, an optional execution architecture, and model routing governed as described in the current-policy note below. The initial agent types are `explorer` and `task`.

Agent types are registered before the tool through an immutable typed Agent Registry. Each Agent Descriptor owns executable behavioral policy: task bounds and concurrency, permissions, prompt-context policy, model policy, result bounds, supported runtimes, and deterministic runtime preference. Markdown agent definitions continue to own child prompt and parent-steering prose and must declare `toolName: subagent`.

Execution is selected independently through a Runtime Registry. Runtime adapters own subprocess or in-process mechanics; descriptors only declare compatibility and preference. Omitted or `auto` execution follows descriptor preference and initially chooses subprocess for both built-ins. An explicit supported runtime override is allowed, but cannot alter descriptor permissions. In-process execution uses the production Pi SDK with persistent child sessions, disables extensions to prevent recursion, retains skills and context-file discovery, and disables delegated prompt-template expansion.

The migration is a hard cut: no `explore` or `forked_pi_agent` compatibility aliases remain. Lower-level `RunnerSubagent*`, `dispatchRunnerSubagent`, and `SubagentRuntime.dispatch` APIs remain valid substrate vocabulary and interfaces for direct consumers, including terminal-capture users.

## Current model-routing policy

The original optional free-form model override has been superseded for this model-visible interface. Omission applies descriptor policy: implementation `task` children inherit the parent provider, model, and thinking policy, while explorers retain descriptor-owned cheap-or-inherit routing. The only caller-selected implementation route is the closed `routing: "cheap"` intent, resolved before dispatch to an approved model within the parent's concrete provider; missing mappings inherit, and launch failure never authorizes reactive rerouting. Trusted lower-level `dispatchRunnerSubagent` consumers may retain explicit typed model mechanics for separate contracts.

## Consequences

- The parent model sees one delegation interface and an explicit catalog of behavioral choices.
- New agent types extend a typed startup registry instead of adding model-visible tools.
- Agent policy and execution architecture can evolve independently, and runtime selection cannot weaken permissions.
- Subprocess remains the automatic isolation default; explicit in-process execution has weaker fault isolation but equivalent descriptor policy.
- The host tool context exposes its concrete model registry so an in-process adapter resolves the same normalized provider/model decision to a Pi SDK model without casting a neutral model summary.
- Agent definition identity changes require a restart because the tool schema is startup-bound; prompt prose is reloaded for the selected agent at execution time.
- Existing prompts, skills, docs, and tests must migrate in one hard cut because aliases would preserve ambiguous routing language.
- The unified tool preserves the pre-unification abnormal-completion UI notification at the tool layer: when any dispatched task ends without final text, the host UI is notified once per call.

## Considered options

- **Keep separate tools:** rejected because every agent type would enlarge the model-visible surface and duplicate orchestration.
- **Require callers to choose a runtime:** rejected because most callers want behavioral delegation, not an architecture decision; `auto` preserves a safe deterministic default.
- **Let the host choose runtime without an override:** rejected because explicit in-process testing and advanced same-process use are legitimate while still subject to descriptor policy.
- **Scan a Markdown directory to discover agents:** rejected because prose cannot safely encode executable permissions, concurrency, retry policy, and runtime compatibility. Registration must be typed and immutable.
- **Retain compatibility aliases:** rejected because the package is private and unreleased and aliases would keep obsolete routing concepts alive.
- **Use agent-specific public option unions:** rejected because the common tool should stay agent-neutral; descriptors enforce policy rather than growing a public options bag.

## Open questions

Additional agent types may prove that the descriptor policy vocabulary needs another capability. Such a change should extend the typed descriptor deliberately without introducing agent-specific fields into the model-visible input.
