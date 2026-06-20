# Cross-Surface Skill and Command Inventory

## Summary

Rephased the Objective around the current problem and completed the fresh cross-surface inventory slice.

The Objective now treats the active work as agent skill and command surface consolidation rather than the earlier closure-ready Pi command cleanup. Historical Pi cleanup updates remain evidence, but closure now depends on first-party skill dispositions, installed-skill policy, Pi command coherence, CLI-helper boundaries, and routing docs.

Fresh inventory is recorded in `docs/agent-resource-catalog.md`. Key evidence:

- `skills/` contains 21 first-party skills.
- `.agents/skills/` contains 45 entries: 21 symlinks to first-party skills and 24 real-directory remote/vendored skills.
- `.claude/skills/` contains 45 symlinks into `.agents/skills/`.
- `skills-lock.json` contains 45 entries: 21 local and 24 GitHub-sourced; `dev-checkpoint` and `objective-create` have `PENDING_REGEN` hashes.
- Pi RPC `get_commands` reports 81 visible commands total on this machine: 31 extension commands and 50 skill commands, with no duplicate names observed.
- Pi RPC reports 20 project extension commands and 45 project skill commands.
- Pi RPC also reports 16 user-scope commands, which remain advisory/personal-resource evidence rather than repo-owned work.
- `.pi/extensions/` contains 9 project-local adapter files.
- `.pi/prompts/` and `.pi/skills/` are absent.
- Relevant skill-facing CLI `exec` helpers are cataloged across `objective`, `brmem`, `aretro`, `pr-address`, and `roaster`.

The catalog now includes an initial cluster/disposition map for Objective/prototype runners, handoff and Branch Memory, branch retrospectives, dev/source-control/GitHub/Graphite workflows, PR-address/review automation, grill/structured questioning, planned branches, remote/vendored skills, and user-local runtime resources.

## Objective Impact

The first substantive roadmap item is complete: the current skill/command surface has been inventoried and clustered before making consolidation edits.

The inventory surfaced concrete next decisions and cleanup candidates:

- `pi-grill-ui` is an internal backend skill but is still visible as `/skill:pi-grill-ui`; it also lacks an H1.
- `proto-objective-impl` and `/proto:objective-impl` need a lifecycle decision before they become permanent public surface by accident.
- `objective-stack-impl`, `proto-objective-impl`, `pr-address`, `brmem`, `dev-gt-restack-resolve`, and `dev-stacker-agent` are large enough to audit for progressive disclosure or CLI push-down.
- `dev-gh-ci-debug`, `dev-gt-stackify-branch`, `dev-just-fix`, `dev-stacker-agent`, and `pr-address` still carry stale `Original description` H1 scaffolding.
- Vendored `handoff`, `grill-me`, and `grill-with-docs` overlap conceptually with first-party or Pi-specific workflows and need an installed-surface policy decision.
- `docs/pi/README.md` still has older current-inventory wording and should be reconciled with `docs/agent-resource-catalog.md` after disposition decisions.

The roadmap now marks the fresh inventory slice complete and leaves taxonomy, first-party cluster dispositions, cleanup, consolidation, remote/vendored policy, docs reconciliation, and post-change verification open.

## Follow-Ups

- Define the final taxonomy and disposition format using the catalog's current cluster map as the starting point.
- Start first-party cluster audit with the highest-confusion area: Objective implementation runners (`objective-stack-impl`, `proto-objective-impl`, `/objective:stack-impl`, `/proto:objective-impl`, and runner-subagent helper surfaces).
- Use `ns-skill-management` before any skill add/remove/rename/install changes so `skills/`, `.agents/skills/`, `.claude/skills/`, and `skills-lock.json` stay consistent.
