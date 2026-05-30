# Roadmap

## Work

- [ ] Settle the public handoff artifact vocabulary and document the distinction from compaction and generic session summaries.
- [ ] Decide the public save/load command names and transition policy for the existing `/brmem-handoff` and `/brmem-pickup-handoff` Pi commands.
- [ ] Make handoff save focus first-class: update prompts and command behavior so the future-continuation focus shapes the handoff artifact and missing focus is handled intentionally.
- [ ] Rework save/load user-facing copy so normal descriptions, notifications, injected prompts, and success output say "handoff" rather than exposing Branch Memory storage details.
- [ ] Add current-branch handoff listing, with user-facing output that shows handoff slugs/titles and enough metadata to choose one without knowing storage keys.
- [ ] Add all-branches handoff listing for the current repo, with branch name as a visible column and filtering/sorting that keeps stale or noisy entries understandable.
- [ ] Decide whether listing belongs in Pi commands, a lower-level CLI operation, or both, and implement the selected path with tests.
- [ ] Update Codex/Claude skill surfaces so non-Pi agents can save and load handoffs using the same artifact vocabulary while still using low-level `brmem` only as storage/recovery machinery.
- [ ] Update docs and resource catalogs for the new handoff artifact model, command names, listing behavior, and Branch Memory implementation-detail boundary.
- [ ] Run fresh Pi command inventory and checked-in skill/instruction inventory after surface changes, then record the results in an Objective update.
- [ ] Run relevant validation for touched TypeScript, Python, Markdown, and CLI code paths, then record pass/fail evidence in an Objective update.

## Parked

- [ ] Unifying planned branches, retrospectives, and handoffs under a broader context-continuity namespace is parked unless a later Objective explicitly takes it on.
- [ ] Migrating existing stored handoff entries is parked unless implementation evidence shows the current storage contract cannot support the new UX.
- [ ] Redesigning low-level Branch Memory storage, refs, or CLI semantics beyond what handoff listing needs is out of scope.
- [ ] Turning handoffs into a task system, owner tracker, due-date system, or hidden workflow registry is out of scope.
