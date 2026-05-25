# Impl Skill Discovery Removed

## Summary

- Decided that `brmem-plan-impl` should not remain a standalone skill, compatibility shim, or renamed skill; `/impl-planned-branch` is now the only public implementation workflow surface.
- Removed the repo-local skill source, `.agents` and `.claude` discovery symlinks, `skills-lock.json` entry, `just install-tools` global-link behavior, and user-facing docs/tests references to the skill.
- Moved implementation prompt prose into `ts/packages/pi-extensions/src/brmem-plans/prompts/impl-planned-branch.md`, loaded by the extension from `attached-plan.ts`, preserving checklist-first behavior, ambiguity stops, authoritative-plan handling, and Branch Memory mutation guardrails.
- Verification: targeted attached-plan/create-plan-branch tests passed, `just ts-check` passed, `just ts-test` passed, `just dprint-check` passed, `git diff --check` passed, and `npx skills list --json` no longer lists `brmem-plan-impl`.
- Evidence: local branch diff against Graphite parent `update-planned-branch-layer-planning-interface`; PR evidence was not required because local committed branch evidence and Graphite branch info were sufficient.

## Objective Impact

- The skill naming cleanup roadmap item is complete: there is no discoverable skill that tells agents to use another command, so future agents and workflows should see only the slash command path.
- `/impl-planned-branch` prompt ownership is now part of the planning/Pi extension layer instead of the skill system, which keeps Branch Memory plan implementation guidance close to the tested reader.
- Planned-branch documentation cleanup is partially advanced by removing helper-skill wording and links from `packages/brmem/README.md`, but durable workflow docs still need to move or shrink to a concise pointer outside the Branch Memory package README.
- The Objective remains open because final module naming, full docs relocation, explicit `pi-extension-deepening` disposition, and human closure are still pending.

## Follow-Ups

- Move durable planned-branch workflow documentation to a non-skill planning/Pi extension surface and reduce `packages/brmem/README.md` to a concise pointer if needed.
- Add the promised cross-reference or disposition update in `pi-extension-deepening`.
- Decide whether remaining module/type names should move further away from `brmem` vocabulary before requesting closure.
