# Final Routing Inventory and Closure Evidence

## Summary

Completed the final stale-name/routing pass and refreshed the closing inventory for the agent skill and command surface consolidation Objective.

Docs/routing changes:

- Corrected `docs/pi/README.md` so the landing cleanup-history row routes current single-PR and stack landing behavior through `/code:land` and `/code:land-stack` rather than the superseded `/gh:land` / `/gt:land-stack` intermediate names.
- Updated `docs/pi/README.md` current inventory to match checked-in `.pi/extensions/`: removed stale `runner-subagent-demo.ts`, added `grill-ui.ts` and `proto.ts`, and documented their engineered implementations.
- Updated `docs/agent-resource-catalog.md` from the final inventory: 42 first-party skill commands, 22 project Pi extension commands, and 3 project Pi custom tools.
- Added the previously omitted first-party skill rows for `typescript-style`, `typescript-fake-driven-testing`, `pi-grill-ui`, and `proto-objective-impl`.
- Added the live `/grill-ui`, `grill_ask`, and `/proto:objective-impl` project Pi surfaces and documented the structured-grill and prototype-runner dispositions.

Final stale-name/routing search across `AGENTS.md`, `CLAUDE.md`, `docs/agent-resource-catalog.md`, `docs/pi/README.md`, `docs/pi`, `skills`, `.pi/extensions`, and `ts/packages/pi-extensions` found no active `Original description` scaffolding and no stale current-routing `dev-*` names. Remaining hits are intentional: current canonical `code-*` and `internal-code-*` names, explicit legacy-alias absence statements, preserved historical `dev-objective-impl` design notes, parked `proto-objective-impl` routing, and the public `pr-address` workflow.

Final inventory evidence:

- `skills/` contains 42 first-party `SKILL.md` files.
- `.agents/skills/` contains 50 entries: 42 symlinks to first-party skills and 8 real-directory vendored/external skills.
- `.claude/skills/` contains 50 symlinks.
- `skills-lock.json` contains 50 entries; 11 local entries still have `computedHash: PENDING_REGEN`, accepted as install-time metadata rather than closure blockers.
- `INSTALL_INTERNAL_SKILLS=1 npx skills list --json` reported 50 installed project skill entries and included `internal-code-just-fix`, `pi-grill-ui`, and `proto-objective-impl`.
- `.pi/extensions/` contains 10 checked-in `.ts` files; `.pi/prompts/` and `.pi/skills/` are absent.
- Pi RPC `get_commands` reported 88 visible commands total, with 22 repo-owned project extension commands, 50 project skill commands, no project prompt commands, and no legacy `/dev:cp`, `/dev:submit`, `/cp`, `/newbr`, `/submit`, `/gh:land`, `/gt:land-stack`, `/land`, or `/land-stack` aliases.

Validation: `git diff --check` passed; `just dprint-check` passed after formatting docs with `just dprint-fix`. TypeScript and Python checks were not rerun because this closing pass changed only Markdown docs and Objective tracking.

## Objective Impact

The final non-parked roadmap work is complete. The catalog and Pi docs now route agents to the consolidated surface, include the live internal/prototype and TypeScript skill rows that the prior catalog undercounted, and explicitly separate canonical current names from legacy/historical/parked references.

The roadmap now marks the first-party audit/disposition, consolidation, routing-docs, and final inventory rows complete. Deeper work that would otherwise keep expanding the Objective is explicitly parked or accepted as follow-up scope: prototype runner lifecycle disposition, PR-address/review automation push-down, deep vendored skill rewrites or removals, user-local personal resources, and future individual `internal-code-*` promotion/merge/removal choices.

Closure criteria are satisfied for this Objective's intended scope. Closure context was added to `objective.md`, and `closed.md` marks the active Objective record closed while keeping `.asdl/objectives/pi-resource-surface-cleanup/` in place.

## Follow-Ups

- If `proto-objective-impl` should be merged, promoted, or retired, explicitly unpark that lifecycle decision in separate work.
- If PR-address/review automation helpers land elsewhere, record a later Objective update only if they change this Objective's durable routing story.
- Treat any desire to regenerate local `PENDING_REGEN` lock hashes as a separate skill-management slice.
- Continue to exclude vendored real-directory `.agents/skills/` entries from first-party deep review unless explicitly requested.
