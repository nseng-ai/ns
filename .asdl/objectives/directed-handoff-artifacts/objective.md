# Directed Handoff Artifact Workflow

## Thesis

A handoff should be a directed saved work-context artifact that a future session, agent, worktree, or human can load to continue a specific piece of work. The public user model should be "save a handoff" and "load a handoff," not "write Branch Memory entries." Branch Memory remains a useful lower-level storage abstraction, but ordinary handoff UX should hide namespaces, keys, refs, and commits unless the user needs technical recovery details.

The important distinction is direction. A generic session summary answers what happened; compaction helps the current conversation fit in the model context window. A handoff answers a future-continuation question: given this requested focus, what does the next session need to know to proceed correctly? Two handoffs from the same session may differ because they prepare different future continuations.

## Scope

In scope:

- Define the public handoff artifact vocabulary for this repo: what a handoff is, how it differs from compaction and generic session summaries, and what users should expect to save and load.
- Reframe the existing handoff/pickup flow so normal user-facing Pi commands, prompts, descriptions, notifications, docs, and skills talk about saved handoffs rather than Branch Memory.
- Rename the public handoff save/load/list Pi commands and Codex/Claude-facing handoff skills so normal handoff names no longer use the `brmem` prefix; decide exact non-`brmem` names and transition policy for the existing `/brmem-handoff`, `/brmem-pickup-handoff`, `brmem-handoff`, and `brmem-pickup-handoff` surfaces.
- Make handoff focus first-class. A save request should strongly encourage or require the future-continuation focus and should ask for one when omitted instead of producing an undirected summary.
- Add a way to list handoffs on the current branch.
- Add a way to list handoffs across all branches in the current repo, with branch name as a visible column.
- Preserve Branch Memory as the implementation detail for storing and loading handoff text when it remains the right storage layer, while keeping low-level `brmem` operations available for debugging and recovery.
- Update checked-in docs and resource catalogs so Pi, Codex, and Claude users see the handoff artifact workflow rather than the storage mechanism.
- Add or update tests for any changed command parsing, prompt construction, listing behavior, storage gateway behavior, or TypeScript/Python CLI paths touched by the implementation.

## Non-Goals

- Do not unify plans, retrospectives, and handoffs under a broad `/context:*` or session-management namespace in this Objective. This Objective focuses on the handoff artifact flow.
- Do not redesign the entire Branch Memory system or remove the low-level `brmem` CLI/skill. Low-level Branch Memory remains useful for direct storage, inspection, and recovery.
- Do not require existing stored handoff entries to be migrated to a new storage namespace unless implementation evidence shows migration is necessary.
- Do not make handoffs a task database, ticket system, hidden workflow state machine, or owner/due-date tracker.
- Do not expose Branch Memory namespace/key/ref mechanics in the default UX merely because those details exist underneath.
- Do not generalize user-local or personal Pi resources unless they are explicitly required for this handoff flow.

## Completion Criteria

This Objective can close when all of the following are true:

- The repo documents a concise handoff artifact model: a handoff is directed, saved, loadable work context for a specific future continuation.
- The docs explain how handoffs differ from compaction and generic session summaries.
- The public save/load/list handoff command and skill names are decided and implemented in checked-in Pi, Codex, and Claude surfaces, and normal public handoff names no longer use the `brmem` prefix; old `brmem`-named handoff entrypoints are removed or retained only as explicitly documented deprecated compatibility/recovery shims.
- The save flow makes the future-continuation focus first-class and handles missing focus intentionally.
- The load flow lets the user load a saved handoff by slug, selector, or picker without requiring knowledge of Branch Memory namespaces or keys.
- Users can list handoffs on the current branch.
- Users can list handoffs across all branches in the current repo, with branch name shown as a column.
- Normal success, picker, prompt-injection, and error copy uses handoff vocabulary. Branch Memory implementation details appear only in technical recovery output, logs, or low-level docs.
- Codex and Claude have renamed, documented skill paths for saving and loading handoffs that present the same artifact model while treating low-level `brmem` only as storage/recovery machinery.
- Low-level `brmem` storage/recovery affordances remain available and documented as implementation/recovery details rather than the primary UX.
- Fresh Pi command inventory and relevant skill/instruction inventory have been run after material surface changes and summarized in an Objective update.
- Relevant tests and formatting checks have passed for touched TypeScript, Python, Markdown, and CLI areas.

## Assumptions and Risks

Assumptions:

- "Handoff" is the right public noun when consistently treated as a directed saved artifact: users save a handoff, load a handoff, list handoffs, and resume from a handoff later.
- The final project-local Pi surface is `/handoff:save`, `/handoff:load`, and `/handoff:list`; the first-party portable skills are `handoff-save` and `handoff-load`.
- The final handoff storage contract is Branch Memory namespace `handoffs` with flat key `<semantic-slug>.md` on the branch carrying the handoff.
- Branch Memory remains the right underlying storage abstraction for branch-scoped handoff artifacts, but it is invisible in normal save/load/list UX except as technical locator or recovery evidence.
- The old `brmem`-named handoff commands, first-party skills, symlinks, and storage contract have no compatibility users in this repo; no aliases, shims, or migration are needed.
- The generic low-level `brmem` CLI and `brmem` skill can remain `brmem`-named because they are storage/recovery surfaces; the non-`brmem` naming requirement applies to handoff artifact UX surfaces.

Risks:

- Handoff may still sound interpersonal or final; current docs and skills mitigate this by emphasizing future-you, future-agent, future worktree, teammate, and pause/resume continuation use cases.
- A focus-required save flow can become annoying if it blocks quick handoffs; the command asks one cheap continuation-focus question and stops rather than creating an undirected summary.
- All-branch handoff listing may be noisy if stale branches contain old entries; the current list output includes branch and preview columns and keeps storage keys out of normal copy.
- Hiding Branch Memory too completely could make recovery harder when storage operations fail; technical locators and low-level `brmem list --all-branches` recovery remain documented.
- Immediate removal of old names can strand anyone relying on them, but the no-users decision intentionally accepts that risk to keep the public surface small.

## Open Questions

Resolved in the 2026-05-30 save/load/list rename slice:

- Command and skill names: `/handoff:save`, `/handoff:load`, `/handoff:list`, `handoff-save`, and `handoff-load`.
- Listing shape: a public Pi list command plus low-level `brmem list --all-branches` for storage/recovery.
- Transition policy: immediate removal of old `brmem`-named handoff surfaces; no aliases, shims, or migration.
- Technical locators: Branch Memory namespace `handoffs`, entry `<semantic-slug>.md`, branch, ref, and commit appear only as technical evidence or recovery detail.
