# Skill and Command Surface Rephase

## Summary

Rewrote the Objective around the current problem: the repo has added enough first-party skills, remote/vendored installed skills, Pi wrappers, and internal prototype workflows that the earlier closure-ready Pi cleanup framing is stale.

Preliminary evidence at rephase time:

- `skills/` contains 21 first-party skills.
- `.agents/skills/` and `.claude/skills/` each expose 45 entries.
- `.agents/skills/` includes 21 first-party symlinks and 24 real-directory remote/vendored entries.
- `.pi/extensions/` contains 9 project-local adapter files, including `dev.ts`, `handoff.ts`, `objective.ts`, `proto.ts`, and `grill-ui.ts`.
- `.pi/prompts/` is absent.
- `skills-lock.json` includes current first-party entries such as `handoff-save`, `handoff-load`, `pi-grill-ui`, and `proto-objective-impl`, plus multiple GitHub-sourced skills.
- Several first-party command skills still show cleanup signals, such as stale `Original description (preserved for reference):` H1s.
- Recent commits added or changed `/proto:objective-impl`, `proto-objective-impl`, `pi-grill-ui`, and the handoff skill/command surface, which means the previous roadmap no longer represented the useful next work.

The Objective's durable files now frame the work as agent skill and command surface consolidation. The premise is still to reduce and clarify agent-facing surface area, but the active target is no longer only Pi command cleanup. It is the combined surface of first-party skills, installed skills, Pi slash commands, CLI helpers, and routing docs.

## Objective Impact

The Objective is no longer closure-ready. The old completed roadmap has been replaced with a new consolidation roadmap:

- inventory the current skill/command/instruction surface;
- define a taxonomy and disposition format;
- audit first-party skills cluster-by-cluster;
- clean low-risk first-party skill metadata and trigger quality;
- consolidate or retire duplicate/obsolete skills and wrappers through skill-management conventions;
- review remote/vendored installed skill policy;
- update docs and rerun inventories/validation.

The slug remains `pi-resource-surface-cleanup` for durable identity. Historical Pi cleanup updates remain useful evidence, but closure now depends on the new skill/command consolidation criteria.

## Follow-Ups

- Start with the fresh cross-surface inventory and cluster map.
- Prioritize high-confusion first-party clusters: Objective/prototype/standing runners, handoff and Branch Memory, branch retrospective and `aretro`, dev/source-control/GitHub/Graphite, PR-address/review, Pi UI/internal helpers, and command-wrapper skills.
- Use `ns-skill-audit` for skill quality and `ns-skill-management` for any add/remove/rename/install changes.
