# Point System Documentation Graduation

## Summary

The temporary point-system brief was graduated into durable records:

- `docs/adr/0031-point-system.md` records the accepted point-system decision, considered options, consequences, and deferred work.
- Root `CONTEXT.md` now owns repo-wide point-system vocabulary and anti-vocabulary: Point, Hook, Prompt, Define, Install, and Point catalog.
- `ts/packages/kernel/CONTEXT.md` now owns kernel-specific mechanics and surfaces: `ns.points`, point ids/definitions/installations, `[points]`, the shared project-config loader, prompt defaults/sources, catalog diagnostics, and `ns extension points` / `ns extension point <id>`.
- `.ns/objectives/point-system/brief.md` was deleted by design because it was a temporary planning source, not durable truth.
- `.ns/objectives/point-system/orientation.md` was removed because the Objective is now closed; closed Objectives leave the always-load orientation set.

## Objective Impact

This completes the final roadmap row and the Objective's completion criteria. The Objective is closed with `closed.md`; `objective.md` now points to ADR 0031 and the CONTEXT files instead of the deleted brief.

Validation evidence:

- `ns objective check point-system` passed with 0 errors and 0 warnings.
- `just dprint-check` passed.
- Full `just` passed, including dprint, TypeScript style guard, dependency check, format/lint/typecheck, Vitest suites, and Objective edge sweep.
- Stale source-of-truth sweep over `.ns/objectives/point-system`, ADR 0031, and root/kernel CONTEXT files found no authoritative reference to the deleted brief; remaining `brief.md` mentions are historical/tracking notes saying it was graduated and deleted.
- Stale vocabulary sweep over root/kernel CONTEXT and ADR 0031 found only intentional avoid-list / rejected-option uses of "extension point" and "hook point", plus the valid `ns extension points` command spelling.

## Follow-Ups

No follow-up remains inside this Objective. Parked future ideas stay outside the Objective: `ns extension install` / `update`, global installation tiers, first-class agent-task point kinds, and an SDLC lifecycle lens.
