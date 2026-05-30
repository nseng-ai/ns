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
- The best near-term command surface should avoid a broad namespace such as `/context:*` and instead make the handoff artifact commands clear on their own.
- Branch Memory remains the right underlying storage abstraction for branch-scoped handoff artifacts, but it should become invisible in the normal save/load UX.
- Listing handoffs across branches can be implemented without requiring users to understand Branch Memory refs or storage internals.
- Existing handoff artifacts under the current storage contract should remain loadable after the public command and skill rename/reframe.
- The generic low-level `brmem` CLI and `brmem` skill can remain `brmem`-named because they are storage/recovery surfaces; the non-`brmem` naming requirement applies to handoff artifact UX surfaces.

Risks:

- Handoff may still sound interpersonal or final; the vocabulary slice mitigates this by emphasizing future-you, future-agent, future worktree, teammate, and pause/resume continuation use cases, but future command-name and listing work must preserve that emphasis.
- A focus-required save flow can become annoying if it blocks quick handoffs; the prompt should make focus cheap while still preventing undirected summaries.
- All-branch handoff listing may be expensive, noisy, or ambiguous if stale branches or archived refs contain old entries; branch filtering and clear columns will matter.
- Hiding Branch Memory too completely could make recovery harder when storage operations fail; technical details should be available on failure without dominating the happy path.
- Renaming all visible handoff commands and skills can strand users who remember the old names unless the transition is documented and any compatibility aliases are deliberately handled.

## Open Questions

- What exact non-`brmem` command and skill names should replace the current `brmem`-named handoff surfaces: `/save-handoff` and `/load-handoff`, `/handoff:save` and `/handoff:load`, or another set?
- Should listing use separate commands such as `/list-handoffs`, flags on the load command, a picker-first load experience, or lower-level CLI commands surfaced through docs?
- Should transition compatibility use hidden/deprecated aliases, documented one-way migration only, or immediate removal of the old `brmem`-named handoff surfaces?
- What exact expanded/error formatting should show compact Branch Memory technical locators now that the vocabulary slice establishes they belong after success, on error, or in recovery docs?
