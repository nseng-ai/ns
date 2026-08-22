# Handoff: Simplify conversational Saved Plan resolution

Continuation focus: Start a fresh design session to replace or substantially simplify the Saved Plan observer by letting an LM resolve the plan the user currently intends from the conversation, then pass an explicit artifact to deterministic CLIs.

## Context

This handoff concerns PR #4268 on branch `saved-plan-cli-handoff-observers`. The PR moves Saved Plan persistence out of Pi's model-visible `write_saved_plan_file` tool and into hidden `enriched-plan exec save`, then adds a Pi `SavedPlanObserver` that recognizes the model's Bash invocation, validates its JSON result, and records `ns:saved-plan` custom session evidence.

The design discussion stepped back from the implementation mechanism to the product workflows: create/refine a plan, persist it durably, and use it either directly or as Branch Context. The observer may be unnecessary machinery if an LM can inspect the conversation, identify the latest plan the user means, save it when necessary, and invoke deterministic CLI operations with an explicit path.

## Current State

PR #4268 is implemented and pushed. No changes were made during this design discussion. The current implementation is functional and strongly validated, but it encodes “the plan created by this observed save command” as host-level session evidence.

The proposed alternative is only a design direction; it has not been specified, tested, or implemented. The fresh session should evaluate the full workflow before editing the PR.

## Decisions / Findings

- The observer exists because Pi does not synchronously invoke the save CLI. `/ns:plan:save` dispatches an agent turn; the model later invokes `enriched-plan exec save` through Bash. The observer correlates that later command/result with the session.
- The observer is required only by the combination of model-driven Bash execution and imperative Pi code needing deterministic `ns:saved-plan` evidence. It is not required for persistence itself.
- The custom session entry is an index, not the durable product artifact. The durable artifact is the Saved Plan in the Local Plan Store.
- A more product-aligned intent is “use the current endorsed plan from this conversation,” not necessarily “use the file created by the most recently observed save.” A newer revised plan may have been presented after an earlier save.
- Promising responsibility split: the LM performs semantic resolution (“which plan does the user mean?”); portable CLIs perform deterministic effects and validation (“save/attach/implement this exact artifact”).
- Candidate resolution order: explicit user selection; latest endorsed conversational plan; latest successful save result; latest complete unsaved plan; branch-scoped latest Local Plan Store file; ask on unresolved ambiguity.
- Under that direction, Pi branch-context commands may need to become agent workflows that let the LM inspect the transcript and then invoke CLIs explicitly, rather than imperative handlers that resolve a plan before an LM can reason about the conversation.
- Potential removals include `SavedPlanObserver`, observer lifecycle and shell parsing, `ns:saved-plan` custom entries, and session-entry selection machinery. Retain `enriched-plan exec save`, typed JSON output, Local Plan Store validation, explicit-path operations, deterministic non-conversational fallback, collision refusal, and path-containment safety.
- No final decision has been made. Important questions include context compaction, transcript availability across fresh sessions, how “endorsed” is recognized, how unsaved plan text is materialized safely, ambiguity UX, and whether direct implementation/from-plan commands should always dispatch an LM turn.

## Next Steps

1. Enumerate the concrete user journeys for save, revise-after-save, implement Saved Plan, create Branch Context, upstack-and-implement, explicit path selection, fresh session, compacted context, and non-Pi/CLI use.
2. Define the minimal durable state each journey needs. Separate conversational intent, Local Plan Store artifacts, and branch-scoped Attached Plans.
3. Design at least two interfaces: the current deterministic observer/index design and an LM semantic-resolver workflow with explicit CLI paths. Compare failure modes, portability, complexity, and behavior after compaction/session replacement.
4. Decide whether `/ns:plan:save` must produce machine-addressable session state at all, or whether later agent workflows can resolve and verify the intended artifact.
5. Trace current downstream consumers of `ns:saved-plan` evidence and determine which become unnecessary, which need explicit paths, and which need a deterministic fallback.
6. Only after selecting the product contract, revise PR #4268 and its tests/docs. Avoid preserving observer complexity merely because it is already implemented.

## Investigation Sources

- Source session ID: 01a0277c-9ca1-78bb-9f2a-6475c2864290
- Source session log: /Users/schrockn/.pi/agent-ns-dev/sessions/--Users-schrockn-.local-state-ns-slots-repos-ns-worktrees-slot-03--/2026-08-22T03-21-13-121Z_01a0277c-9ca1-78bb-9f2a-6475c2864290.jsonl
- Related files:
  - `/var/folders/9f/tdmwr1s936g4_3px8t6cjs7h0000gn/T/pi-runner-subagents/session-OrbjQf/4f599f44-4259-4db9-a85c-55d196698311.jsonl` — explorer analysis of the new Saved Plan CLI save pipeline.
  - `/var/folders/9f/tdmwr1s936g4_3px8t6cjs7h0000gn/T/pi-runner-subagents/session-4rKNg8/18b888c8-cb69-4d36-84a6-2b6f30e026b1.jsonl` — explorer analysis of the Pi observer lifecycle and evidence flow.
  - `ts/packages/incubating/extensions/plans/src/cli.ts` — hidden `enriched-plan exec save` composition and handler.
  - `ts/packages/incubating/extensions/plans/src/save-contract.ts` — typed save request/result contract shared with Pi.
  - `ts/packages/incubating/extensions/plans/src/saved-plan-selection.ts` — current custom-session-evidence validation and selection behavior.
  - `ts/packages/incubating/hosts/pi/extensions/pi-ns-branch-context/src/saved-plan-observer.ts` — observer state machine proposed for possible removal.
  - `ts/packages/incubating/hosts/pi/extensions/pi-ns-branch-context/src/saved-plan-commands.ts` — save command dispatch and observer arming.
  - `ts/packages/incubating/hosts/pi/extensions/pi-ns-branch-context/src/from-plan-commands.ts` — downstream Saved Plan resolution and branch-context workflows.
  - `ts/packages/incubating/hosts/pi/extensions/pi-ns-branch-context/test/saved-plan-observer.test.ts` — precise behavioral contract and edge cases currently supplied by the observer.
  - `docs/pi/branch-context-workflow.md` — documented end-to-end product workflow and current selection precedence.
  - `.ns/prompts/branch-context.plans-write.md` — current model instructions for creating and saving plans.

## Useful Commands / Files

- PR: https://github.com/nseng-ai/ns/pull/4268
- Branch: `saved-plan-cli-handoff-observers`
- Commit: `da3498b71` (`Move Saved Plan persistence to the CLI`)
- Inspect the PR: `gh pr view 4268` and `gh pr diff 4268`
- Find current evidence consumers: `rg -n 'ns:saved-plan|SavedPlanObserver|selectSavedPlan' ts/packages/incubating`
- Domain vocabulary: `ts/packages/incubating/extensions/plans/CONTEXT.md` and `ts/packages/incubating/hosts/pi/extensions/pi-ns-branch-context/CONTEXT.md`
