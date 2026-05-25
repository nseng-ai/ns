# Impl Skill Discovery Removed and Docs Relocated

## Summary

- Decided that `brmem-plan-impl` should not remain a standalone skill, compatibility shim, or renamed skill; `/impl-planned-branch` is now the only public implementation workflow surface.
- Removed the repo-local skill source, `.agents` and `.claude` discovery symlinks, `skills-lock.json` entry, `just install-tools` global-link behavior, and user-facing docs/tests references to the skill.
- Moved durable workflow documentation into `docs/pi/planned-branch-workflow.md`, linked it from `docs/pi/README.md`, and reduced `packages/brmem/README.md` to a generic Branch Memory README with a concise pointer to the Pi/planning workflow.
- Moved implementation prompt prose into `ts/packages/pi-extensions/src/brmem-plans/prompts/impl-planned-branch.md`, loaded by the extension from `attached-plan.ts`, preserving checklist-first behavior, ambiguity stops, authoritative-plan handling, and Branch Memory mutation guardrails.
- Verification: targeted attached-plan/create-plan-branch tests passed, `just ts-check` passed, `just ts-test` passed, `just dprint-check` passed, `git diff --check` passed, and `npx skills list --json` no longer lists `brmem-plan-impl`; `just dprint-check` also passed after the docs-relocation Objective update.
- Evidence: local committed branch evidence for the skill-removal/prompt-template and docs-relocation slices, including the docs-relocation diff against Graphite parent `brmem-plans/impl-planned-branch-reader`; PR evidence was not required because local committed evidence and Graphite branch info were sufficient.

## Objective Impact

- The skill naming cleanup roadmap item is complete: there is no discoverable skill that tells agents to use another command, so future agents and workflows should see only the slash command path.
- `/impl-planned-branch` prompt ownership is now part of the planning/Pi extension layer instead of the skill system, which keeps Branch Memory plan implementation guidance close to the tested reader.
- Planned-branch documentation relocation is complete for this Objective slice: the durable workflow doc lives next to the Pi extension docs, while the brmem README now acts as a concise pointer from the lower storage primitive to the higher planning workflow.
- The Objective remains open because final module naming, explicit `pi-extension-deepening` disposition, and human closure are still pending.

## Follow-Ups

- Add the promised cross-reference or disposition update in `pi-extension-deepening`.
- Decide whether remaining module/type names should move further away from `brmem` vocabulary before requesting closure.
