# Command-first closure boundary

## Summary

The command-first SDL extension architecture experiment has reached its closure boundary without needing to pull broader capability migrations into the same Objective. The completed slices prove the current layered model: SDL keeps a small kernel and public author SDK, repository lifecycle commands live in the grouped project-local `.sdl/extensions/flow` extension, repeated repo-local seams may first consolidate under project-local shared helpers, proven portable primitives may be promoted into `@sdl/sdl/sdk`, and command-specific orchestration may delegate to lower packages when that package already owns the domain.

This disposition intentionally does not create child Objectives or close this Objective. It records the boundary needed to prevent hidden scope creep while leaving follow-up choices explicit for later planning.

## Objective Impact

The active roadmap row for recording the command-first closure boundary can be marked complete. The Objective has enough evidence to distinguish the major extension architecture categories that emerged during migration:

- Public SDL SDK promotion is justified only by repeated demonstrated author pain or a documented single-command necessity; the exec evidence helpers are the proof-of-mechanism example.
- Project-local shared helpers are the preferred intermediate layer for policy-laden or still-evolving seams such as checkpoint message preparation and flow worktree mechanics.
- Lower-package delegation is acceptable when ownership is clear, as with `sdl flow land` delegating to CCC land-stack orchestration rather than promoting a premature public landing SDK.
- Static Pi mirrors under `/sdl:flow:*` are engineered adapters for selected project-local commands, not evidence of dynamic arbitrary extension-to-Pi mirroring.
- Bundled first-party extensions, dynamic Pi discovery, nested command trees, and sophisticated capability migrations such as Handoff, Objectives, Slots, Branch Context, Roaster, PR Address, CCC, or broader Pi workflow modeling remain parked follow-up space rather than command-first closure blockers.

No Objective closure is recorded in this update, per the current execution instruction.

## Follow-Ups

- Decide in a later planning step whether to close `sdl-extension-architecture` now that the command-first boundary is recorded, or keep it open only for a specifically named residual decision.
- If follow-up work is desired, choose one explicit next pressure test instead of re-opening all parked capability migrations at once. Candidate directions include bundled first-party extension packaging, dynamic Pi mirror design, a sophisticated workflow migration such as Handoff, or further SDK promotion from the documented pressure seams.
- Revisit public SDK promotion only when new extension-author evidence exceeds the current project-local-helper or lower-package-delegation boundary.
