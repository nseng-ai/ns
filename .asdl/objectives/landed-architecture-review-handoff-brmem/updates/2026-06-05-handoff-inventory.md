# Handoff Inventory

## Summary

The current durable handoff system is layered over Branch Memory rather than implemented in one place. The inventory found one intended storage convention, several coordinated user-facing surfaces, and one compatibility/legacy signal that should be handled explicitly during contract design.

| Layer                             | Current behavior                                                                                                                                                                                                                                                                                                                                                                                                           | Evidence                                                                                                          |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Handoff save skill                | Public workflow is saving a directed handoff for a continuation focus. Storage uses `brmem check` then `brmem put` in Namespace `handoffs`, with key shape currently shown as `<semantic-slug>.md`; explicit replacement intent is required before overwrite. Branch defaults to current branch unless the user names one.                                                                                                 | `.agents/skills/handoff-save/SKILL.md`                                                                            |
| Handoff load skill                | Public workflow is pickup/list/resume. Listing goes through `handoff list`; reading selected content goes through `brmem get <semantic-slug>.md --namespace handoffs --branch <branch>`. Selection is conservative: exact key/slug, singleton scope, or one clear slug/search match; ambiguous candidates require a user choice.                                                                                           | `.agents/skills/handoff-load/SKILL.md`                                                                            |
| Pi `/handoff:*` extension         | Provides first-class create, pickup, and list commands. Create expands `handoff-save` or fallback prompts with the `handoffs` Namespace. Pickup lists with `brmem list --namespace handoffs`, reads with `brmem get`, opens a picker when multiple candidates exist and UI is available, and rejects slash-containing selectors. List previews artifact bodies and displays pickup commands without exposing storage keys. | `ts/packages/pi-extensions/src/handoff.ts`; `ts/packages/pi-extensions/test/handoff.test.ts`                      |
| `asdl-handoff` CLI                | Implements `handoff list` and `handoff gc`. `handoff list` reads the `handoffs` Namespace and summarizes branch, branch state, slug, key, Entry Locator, and updated timestamp. It filters to recognized flat `.md` keys, hides deleted-branch handoffs unless `--include-deleted` is requested, and separates branch scope from all-branches scope. `handoff gc` previews or deletes handoffs for deleted local branches. | `packages/asdl-handoff/src/asdl_handoff/cli/handoff/`; `packages/asdl-handoff/tests/scenario/test_handoff_cli.py` |
| `brmem` primitive                 | Branch Memory remains generic storage: Entries live in Base or named Namespaces; named Namespaces are workflow-owned; `put` and `delete` write, while `get`, `check`, and `list` are read-only. Handoff-specific slug, overwrite, selection, and stale-content rules belong above `brmem`.                                                                                                                                 | `packages/brmem/CONTEXT.md`; `packages/brmem/README.md`                                                           |
| Worktree status compatibility     | Worktree status normalizes `session-artifacts` keys under `handoffs/` into the `handoffs` display and deduplicates them against real `handoffs` Namespace entries. This is compatibility evidence for a parallel storage shape, not the desired durable handoff contract.                                                                                                                                                  | `ts/packages/pi-extensions/src/worktree-status.ts`; `ts/packages/pi-extensions/test/worktree-status.test.ts`      |
| Live local Branch Memory examples | Read-only local listing showed many existing `handoffs` Namespace entries across local branches, including `master`, mostly using flat `.md` keys. Treat this as non-authoritative migration/anomaly evidence, not as repo source truth.                                                                                                                                                                                   | `brmem list --namespace handoffs --all-branches --format json`                                                    |

Decisions from the grill/design pass:

- Durable user-facing handoffs in this repo should consolidate on Branch-Memory-backed Handoff Artifacts in the workflow-owned `handoffs` Namespace.
- Worker-protocol handoffs such as `stacker-handoff/v1` are separate terminology and should not be folded into this Objective's durable handoff contract.
- Public language should say “handoff”; Branch Memory terms are technical locator/evidence vocabulary.
- Pickup is branch-scoped by default: current branch or explicit `--branch`. Cross-branch listing is for discovery/recovery, not automatic pickup.
- Recency is display evidence, not enough to auto-select among multiple candidate handoffs.
- Deleted-branch handoffs are recovery/cleanup candidates, not normal pickup candidates.
- Overwrite preflight is a hard handoff workflow contract at the skill layer, while `brmem put` remains generic.
- Stale/failure evidence should distinguish deleted branch, missing Entry, ambiguous selection, overwrite risk, and stale artifact content.
- Flat `.md` keys are current implemented behavior, but final key-shape contract remains intentionally open for the next contract-design slice.

Focused evidence commands passed:

- `uv run pytest packages/asdl-handoff/tests/scenario/test_handoff_cli.py` — 28 passed.
- `bun test ts/packages/pi-extensions/test/handoff.test.ts ts/packages/pi-extensions/test/worktree-status.test.ts` — 58 passed.

Documentation updates made during inventory:

- Created `packages/asdl-handoff/CONTEXT.md` as glossary-only handoff vocabulary.
- Updated `CONTEXT-MAP.md` to move `asdl-handoff` from planned to present contexts.

## Objective Impact

The first roadmap item is complete: current handoff and Branch Memory usage has been inventoried across skills, Pi extension commands, the `asdl-handoff` CLI, the generic `brmem` storage primitive, tests, and non-authoritative live local examples.

The next useful semantic step is contract design, using this inventory to decide the final Entry Key convention and the fate of `session-artifacts/handoffs/...` compatibility normalization before changing runtime behavior.

The Objective assumptions are narrowed: the named `handoffs` Namespace is now supported by current evidence as the durable handoff storage convention, while final key shape remains open.

## Follow-Ups

- Decide whether the current flat `<semantic-slug>.md` key shape is final contract, provisional contract, or only current implementation behavior.
- Decide whether `session-artifacts/handoffs/...` compatibility normalization should be migrated, retained as display-only compatibility, or removed.
- Convert the selected contract into the smallest docs/skill/code/test alignment slice without redesigning `brmem`.
- Exercise a normal pickup path and at least one failure/staleness path after the contract-alignment slice lands.
