# Roadmap

## Work

- [x] Settle the public handoff artifact vocabulary and document the distinction from compaction and generic session summaries. Vocabulary settled in this Objective's Thesis (a handoff is directed, saved, loadable work context, distinct from compaction and from generic session summaries), and the handoff/pickup carve-out from `pi-resource-surface-cleanup` is documented in `docs/agent-resource-catalog.md` and `docs/pi/README.md`. The user-facing handoff doc now lives at `docs/pi/handoff-artifacts.md`.
- [x] Choose exact non-`brmem` names and transition policy, then rename the handoff-related Pi commands and Codex/Claude skills away from `/brmem-handoff`, `/brmem-pickup-handoff`, `brmem-handoff`, and `brmem-pickup-handoff`.
- [x] Make handoff save focus first-class: update prompts and command behavior so the future-continuation focus shapes the handoff artifact and missing focus is handled intentionally.
- [x] Rework save/pickup user-facing copy so normal descriptions, notifications, injected prompts, and success output say "handoff" rather than exposing Branch Memory storage details.
- [x] Add current-branch handoff listing, with user-facing output that shows handoff slugs/titles and enough metadata to choose one without knowing storage keys.
- [x] Add all-branches handoff listing for the current repo, with branch name as a visible column and filtering/sorting that keeps stale or noisy entries understandable.
- [x] Decide whether listing belongs in Pi commands, a lower-level CLI operation, or both, and implement the selected path with tests.
- [x] Rename and update Codex/Claude skill surfaces so non-Pi agents can save and pick up handoffs using non-`brmem` handoff names while still using low-level `brmem` only as storage/recovery machinery.
- [x] Update docs and resource catalogs for the new handoff artifact model, command names, listing behavior, and Branch Memory implementation-detail boundary.
- [x] Run fresh Pi command inventory and checked-in skill/instruction inventory after surface changes, then record the results in an Objective update.
- [x] Run relevant validation for touched TypeScript, Python, Markdown, and CLI code paths, then record pass/fail evidence in an Objective update.

## Parked

- [ ] Unifying planned branches, retrospectives, and handoffs under a broader context-continuity namespace is parked unless a later Objective explicitly takes it on.
- [ ] Migrating existing stored handoff entries remains intentionally not planned; the no-users transition decision removed compatibility and migration work from this Objective.
- [ ] Redesigning low-level Branch Memory storage, refs, or CLI semantics beyond `brmem list --all-branches` is out of scope.
- [ ] Turning handoffs into a task system, owner tracker, due-date system, or hidden workflow registry is out of scope.
