# Extension-ported scope gate

## Summary

Scoped the CLI UX house-style rollout to commands that have already been ported to the SDL extension architecture. This Objective now treats command eligibility as a moving architecture fact: a surface is an active migration target only when it is exposed through a project-local SDL extension entry or a first-party Capability command face. Standalone tools and unported capability commands are marked extension-gated rather than active P0/P1 UX work.

Current eligible command-face families for this Objective are Flow, Objective, Slot, and Handoff. The audit must be re-evaluated before each new rollout batch and after material `sdl-extension-architecture` milestones, because the extension migration is still in progress and more command families may become eligible over time.

## Objective Impact

- `objective.md` now states the extension-ported eligibility gate in Scope, Non-Goals, Completion Criteria, Assumptions, and Risks.
- `roadmap.md` now frames remaining work around eligible command faces: Slot navigation/actionable output, Slot/Handoff destructive flows, eligible buffered list/status primitives, and periodic eligibility rechecks.
- `cli-surface-audit.md` now distinguishes eligible work from extension-gated surfaces. `packagechk`, `vibechk`, `roaster`, `areg`, `brmem`, `sdl shell`, `enriched-plan`, and similar standalone/unported surfaces are no longer active migration targets until a later extension-architecture re-evaluation marks them ported.

## Follow-Ups

- Before starting any new migration batch, re-run the eligibility pass against the current SDL extension / Capability command-face inventory.
- When `sdl-extension-architecture` ports another command family, update `cli-surface-audit.md` first, then decide whether this Objective or a follow-on owns its house-style migration.
