# Objective Stack Prompt Orchestration MVP

## Thesis

The Objective stack implementation workflow should be rebuilt as a prompt-first, parent-LLM-driven orchestration flow rather than as a closed-loop extension command.

The parent session is the orchestrator. It plans the stack, chooses the next slice, invokes child sessions as focused LLM-space function calls, interprets their returned text, validates the result, and decides whether to continue. The extension layer provides generic child-session infrastructure and light guardrails; it should not become the domain brain for Objective-stack work.

The user-facing entry point for v1 is a project prompt template at `.pi/prompts/objective-stack-impl.md`, invoked as `/objective-stack-impl [objective-slug]`. It runs in the current session only. The prompt should guide the parent agent to summarize current context handoff-style, inspect the selected Objective and repository state, make a small Graphite stack plan in conversation, and run one child session per implementation slice.

Child sessions should feel like functions in LLM space: the parent passes explicit context as the prompt arguments, the child performs focused work, and the child returns final text to the parent. V1 should therefore enhance the local child-session helper so a child can return its final assistant text directly, without requiring stack-specific terminal tools such as `stack_impl_slice_done` or `stack_impl_slice_blocked`.

V1 is intentionally Branch Memory-free. It should not create stack-plan keys, slice ledgers, or Branch Memory handoffs. Recovery after failure is manual: the user or next agent can inspect the current session, child session files, Objective updates, git/Graphite state, and commits.

## Scope

This Objective covers a steelthread for prompt-first Objective stack implementation:

- Add final-assistant-text return support to the local child-session helper in `ts/packages/pi-extensions/src/run-child-session.ts` and its parser/runner internals.
- Allow a child session mode that does not require terminal capture tools when the caller wants final text as the return value.
- Preserve useful non-success statuses and diagnostics for cancelled, error, protocol-error, and no-useful-text outcomes.
- Expose a generic parent-callable tool such as `run_child_session_text` that accepts a title and prompt, launches an awaited child session in the current cwd, and returns final text plus status/session-path evidence to the parent LLM.
- Wire that tool through the engineered `ts/packages/pi-extensions` layer and a thin project-local `.pi/extensions/*` shim if needed for Pi discovery.
- Add `.pi/prompts/objective-stack-impl.md` as the user-facing entry point, with argument hint `[objective-slug]`.
- Make the prompt current-session-only. It should not create or switch to a new parent orchestration session in v1.
- Make the prompt handoff-inspired: have the parent agent compact relevant current-session context in prose, but reference existing durable artifacts instead of duplicating them.
- Make the prompt brmem-free: no Branch Memory stack plans, slice ledgers, or handoff artifacts.
- Make the prompt prescriptive about sequencing without imposing a durable stack schema: plan a small Graphite stack in conversation, create one branch per slice using normal Graphite workflow, invoke one child per slice, inspect the returned text, validate, update the Objective when meaningful, commit/amend, then decide whether to continue.
- Keep branch/Graphite safety at the parent-agent guardrail level for v1: inspect worktree state before child launch, avoid parallel same-worktree children, and do not submit PRs automatically.
- Cover the helper and generic tool with fake-driven TypeScript tests; do not require live paid/model calls or a real Graphite stack run before the work is ready for user inspection.

## Non-Goals

This Objective does not include:

- A closed-loop extension command implementation of `/objective-stack-impl`.
- Creating or switching to a dedicated parent orchestration session in v1.
- Branch Memory stack-plan storage, slice ledgers, completion handoffs, or automatic recovery machinery.
- Requiring or preserving domain-specific child terminal tools named `stack_impl_slice_done` or `stack_impl_slice_blocked`.
- Code heuristics that parse freeform child text to decide completion.
- A Pi-core API for asking the parent LLM a structured question from extension code.
- Automatic PR submission.
- Parallel child sessions in the same worktree.
- A full deterministic status/recovery command suite for Objective stacks.
- A live Graphite-stack end-to-end run as a closure requirement.
- Depending on legacy rewrite-brief documents as durable source material for v1.

## Completion Criteria

The Objective is ready for user inspection when:

- `runChildSession` or a nearby local helper can return final assistant text from a child session that stops cleanly without terminal capture.
- The returned text result includes enough evidence for parent interpretation: final text, status, elapsed/progress data, and child `sessionFile` when available.
- Existing terminal-capture behavior remains supported and covered, or any intentional API split is documented in code/tests.
- A generic parent-callable `run_child_session_text` tool is available through project Pi extension discovery.
- The tool returns child final text as an ordinary tool result that the parent LLM can interpret, without stack-specific schemas.
- `.pi/prompts/objective-stack-impl.md` exists and is discoverable as `/objective-stack-impl [objective-slug]`.
- The prompt clearly describes the parent-LLM orchestrator model, handoff-style current-context compaction, current-session-only operation, brmem-free behavior, one-child-per-slice sequencing, and manual recovery expectations.
- The prompt instructs the parent agent to use existing Objective, git, Graphite, and validation workflows rather than hidden extension state.
- Fake-driven tests cover final-text extraction from child JSON events and the generic tool's returned text/status/session-path behavior.
- Relevant TypeScript checks/tests and Markdown formatting checks pass, or unrelated blockers are recorded.
- The implementer leaves the Objective open for explicit user inspection and manual closure.

## Assumptions and Risks

Assumptions:

- The parent session LLM is the right place for Objective-stack judgment: planning, interpreting child returns, deciding whether a slice is complete, and choosing the next step.
- A prompt-template entry point is better than an extension-command entry point because it lets the current parent agent summarize context and reason naturally in the active conversation.
- The current session is the right orchestration context for v1; forcing a new parent session would add lifecycle complexity without proving value.
- Final assistant text is a sufficient child-session return value for the steelthread when the prompt asks the child to state outcome, validation, changed artifacts, blockers, and recommended next steps.
- Existing Objective, git, Graphite, and validation workflows are enough durable evidence for v1; Branch Memory-backed auto-recovery is not required.
- Manual recovery after failure is acceptable. If a session dies or a child return is ambiguous, the user or next agent can inspect repo state and child session files.
- Fake-driven tests are the right validation level for the helper/tool steelthread; live model/Graphite runs are useful later but not required before user inspection.

Risks:

- Freeform child text can be ambiguous or overconfident. The parent prompt must ask for explicit state, evidence, and blockers, but the parent LLM still has to interpret prose.
- Without Branch Memory ledgers or handoffs, automatic recovery and status reporting are limited. This is accepted for v1 but may need revisiting if the workflow becomes frequent or long-running.
- Capturing final assistant text depends on Pi JSON event shapes. Parser tests should pin only the event fields needed for useful text extraction and diagnostics.
- A generic child-session text tool may be too permissive for risky repository operations. The Objective-stack prompt must keep same-worktree child runs sequential and require parent-side git/worktree checks.
- Current-session-only orchestration can inherit noisy or stale context. The prompt should explicitly ask the parent agent to compact relevant context and discard distractions before planning.
- If the child stops without useful final text, the parent must treat it as non-complete and inspect the child session file rather than advancing blindly.

## Open Questions

- What exact TypeScript API shape should represent final-text child results: a new result variant, an option on `runChildSession`, or a small wrapper helper around the lower-level runner?
- Should `run_child_session_text` support options such as `requireCleanWorktree`, or should worktree preflight remain entirely in the parent prompt for v1?
- When `/objective-stack-impl` is invoked without an Objective slug, should the prompt ask the parent agent to run Objective selection commands, or should it ask the user directly first?
- How much of the child prompt should be generated by the parent agent ad hoc versus templated inside the Objective-stack prompt?
- After the steelthread is inspected, should any repeated parent-agent steps graduate into deterministic extension tools?
