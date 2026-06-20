# Objective established and handoff/pickup carved out of pi-resource-surface-cleanup

## Summary

This Objective was founded and given an explicit mandate. The directed handoff artifact workflow now exists as its own record (`objective.md` with thesis, scope, non-goals, completion criteria, assumptions/risks, and open questions; `roadmap.md` with the work and parked slices).

The handoff/pickup workflow family was carved out of `pi-resource-surface-cleanup` and reassigned here. The cross-Objective decision is documented in user-facing repo docs: `docs/agent-resource-catalog.md` and `docs/pi/README.md` now describe the target as a directed, saved handoff artifact that users save and load without reasoning in Branch Memory terms, with the current `/brmem-handoff` and `/brmem-pickup-handoff` commands treated as the present implementation until this Objective replaces, deprecates, or explicitly retains them. Branch Memory is positioned as an implementation detail rather than the public model.

No implementation roadmap rows have started. The change set is Objective- and docs-only Markdown; no command parsing, prompt construction, listing, or CLI behavior changed yet.

Evidence: local branch diff against `master` (single commit reframing handoff/pickup as directed artifacts, touching only this Objective's files, the `pi-resource-surface-cleanup` carve-out files, and the two docs). PR #746 ("Add `directed-handoff-artifacts` objective and carve handoff/pickup UX out of `pi-resource-surface-cleanup`") corroborates the same file set. No code validation was required because the landed change is Markdown only.

## Objective Impact

- Roadmap row 1 (settle public vocabulary, document the compaction/summary distinction) moves to `[~]`: the vocabulary is settled in the thesis and the carve-out is documented in the two repo docs, but a user-facing handoff doc stating the compaction/generic-summary distinction outside the Objective record is still pending.
- All remaining work rows stay `[ ]`; the implementation surface (command naming/transition, focus-first-class save, user-facing copy, current-branch and all-branches listing, listing placement, Codex/Claude skill surfaces, full docs/catalog updates, inventory runs, validation) is unstarted.
- Confirms two standing assumptions: "handoff" is the intended public noun for a saved artifact, and the near-term command surface should avoid a broad `/context:*` namespace.
- Establishes the ownership boundary with `pi-resource-surface-cleanup`: that Objective documents the deferral; this Objective owns the rework.

## Follow-Ups

- Resolve the open command-naming question (`/save-handoff`/`/load-handoff` vs `/handoff:save`/`/handoff:load` vs another pair) and the transition policy for the existing `brmem`-named commands.
- Decide the listing surface (Pi commands, lower-level CLI, or both) before building current-branch and all-branches listing.
- Write the user-facing handoff doc that states the compaction/generic-summary distinction, then re-evaluate roadmap row 1 for completion.
- Run a fresh Pi command inventory and skill/instruction inventory once visible surface changes land, and record validation evidence for any touched TypeScript/Python/CLI paths.
