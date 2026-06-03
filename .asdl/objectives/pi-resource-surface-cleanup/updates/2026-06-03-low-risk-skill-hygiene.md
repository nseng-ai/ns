# Low-Risk Skill Hygiene Cleanup

## Summary

Completed the low-risk first-party skill hygiene slice for the current agent skill and command surface consolidation pass.

Skill cleanup performed:

- Added the missing `# pi-grill-ui` H1 to `skills/pi-grill-ui/SKILL.md` while preserving its internal `metadata.internal: true` backend role for the Pi grill UI.
- Removed stale `Original description` frontmatter scaffolding from `skills/internal-code-gt-stackify-branch/SKILL.md`, `skills/internal-code-just-fix/SKILL.md`, `skills/internal-code-stacker-agent/SKILL.md`, and `skills/pr-address/SKILL.md`.
- Removed contradictory `PUBLIC SKILL` comments from internal skills that already carry `metadata.internal: true`: `skills/internal-code-checkpoint/SKILL.md`, `skills/internal-code-gh/SKILL.md`, `skills/internal-code-gh-ci-debug/SKILL.md`, and `skills/internal-code-just-fix/SKILL.md`.
- Left the `PUBLIC SKILL` comment in `skills/pr-address/SKILL.md` because `pr-address` remains a public command skill and the public-skill authoring constraint is still relevant.
- Left `proto-objective-impl` and `/proto:objective-impl` unchanged because the prototype-runner lifecycle decision is parked.

Inventory and install evidence:

- First-party skill hygiene scan now reports no missing H1s and no `Original description` scaffolding in `skills/<name>/SKILL.md`.
- Focused grep reports no `Original description` findings and only the expected `PUBLIC SKILL` comment in `skills/pr-address/SKILL.md` among the checked target surfaces.
- Touched first-party installed surfaces remain symlinked: `.agents/skills/<name> -> ../../skills/<name>` and `.claude/skills/<name> -> ../../.agents/skills/<name>` for the edited skills.
- The 11 remaining `PENDING_REGEN` entries in `skills-lock.json` are all local skill entries. They were accepted rather than mechanically regenerated because the repo's `skill-management` guidance states local `computedHash` values are install-time metadata, stale local hashes are harmless, and `npx skills add` can destructively replace local `.agents/skills/<name>` symlinks with copies.
- Internal skills are hidden from ordinary public skill discovery as expected; `INSTALL_INTERNAL_SKILLS=1 npx skills list --json` confirmed the edited internal skills and `pr-address` are present.

Validation: `git diff --check` passed; `just dprint-check` passed; `INSTALL_INTERNAL_SKILLS=1 npx skills list --json` completed and included the touched skills.

## Objective Impact

The low-risk first-party skill cleanup roadmap row is complete. The branch removes known mechanical hygiene issues without changing skill behavior, public command inventory, Pi extension surfaces, vendored skills, or the parked prototype-runner lifecycle decision.

The Objective remains open. Broader first-party cluster dispositions, possible larger trigger/progressive-disclosure/CLI-push-down decisions, final stale-name pass, post-change inventories, and closure validation remain unfinished.

## Follow-Ups

- Continue the broader first-party disposition work for remaining non-parked clusters.
- Treat any desire to eliminate local `PENDING_REGEN` lock markers as a separate explicit skill-management slice, not as incidental cleanup.
- Keep `proto-objective-impl` / `/proto:objective-impl` lifecycle decisions parked until explicitly unparked.
- Re-run final cross-surface inventories and closure validation after material surface changes are complete.
