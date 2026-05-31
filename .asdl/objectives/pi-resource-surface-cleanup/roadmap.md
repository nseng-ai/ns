# Roadmap

## Work

- [x] Rephase the Objective from completed Pi resource-surface cleanup into current agent skill and command surface consolidation, keeping the durable slug while replacing stale closure assumptions.
- [ ] Run a fresh cross-surface inventory and capture the evidence: first-party `skills/<name>/SKILL.md` metadata and line counts, `.agents/skills/` and `.claude/skills/` provenance, `skills-lock.json` state, Pi RPC command inventory, `.pi/extensions/`, `.pi/prompts/`, relevant CLI `exec` helpers, and agent instruction/catalog docs.
- [ ] Define and document the consolidation taxonomy and disposition format for agent resources: public portable workflow skills, command skills, internal/dev skills, prototype skills, Pi-only adapters, CLI primitives, remote/vendored skills, and user-local personal resources.
- [ ] Audit first-party skills cluster-by-cluster and assign dispositions, starting with the highest-confusion clusters: Objective/prototype/standing runners, handoff and Branch Memory, branch retrospective and `aretro`, dev/source-control/GitHub/Graphite, PR-address/review, Pi UI/internal helpers, and command-wrapper skills.
- [ ] Apply low-risk first-party skill cleanup found by the audit: fix stale H1s and `Original description` scaffolding, tighten trigger descriptions, normalize command-skill frontmatter, add or remove internal metadata where appropriate, and split or push down oversized procedural bodies when the win is clear.
- [ ] Consolidate, rename, hide/internalize, or remove duplicate and obsolete first-party skills or command wrappers after their dispositions are agreed; update `skills/`, `.agents/skills/`, `.claude/skills/`, and `skills-lock.json` through the repo's skill-management conventions.
- [ ] Review the remote/vendored installed skill set and decide a repo policy for keeping, removing, or documenting those entries without treating vendored code as first-party audit material.
- [ ] Update `docs/agent-resource-catalog.md`, `docs/pi/README.md`, `AGENTS.md`, `CLAUDE.md`, and any affected skill docs so they route agents to the consolidated surface and remove stale names from earlier Objective phases.
- [ ] Re-run post-change inventories and relevant validation, then record completion evidence and any accepted residual risks in an Objective update.

## Parked

- [ ] User-local CMUX, `gh-pr`, `stack-latest`, and other personal-machine resources remain advisory unless explicitly requested.
- [ ] Deep rewrites of GitHub-sourced or vendored skills are parked unless a separate explicit decision treats one as first-party work.
- [ ] Dedicated Codex-specific configuration remains parked unless the inventory finds a concrete gap that `AGENTS.md`, first-party skills, and CLI/docs workflows cannot cover.
- [ ] Broader Objective runner or standing-objective product redesign is parked unless this audit finds a direct surface-area cleanup action; deeper product design belongs in its own Objective.
