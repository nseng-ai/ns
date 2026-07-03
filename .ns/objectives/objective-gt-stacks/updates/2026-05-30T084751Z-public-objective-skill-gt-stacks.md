# Public Objective Skill Describes GT Stack Projection

## Summary

Updated `skills/objective/SKILL.md` to make the public Objective skill describe the checkout-local vs Graphite-stack split. It now names `objective list` as checkout-local inventory, describes `objective gt stacks` as read-only Graphite stack projection, warns against using stack projection as active Objective selection inventory, and states that archive-root paths are ignored while active-root lifecycle changes still count as touches.

Verification: `git diff --check` passed; `just dprint-check` passed.

## Objective Impact

The remaining public-skill Phase 6 docs row is complete. This satisfies the completion criterion that first-party consumers and docs, including the public `objective` skill, describe the split between checkout-local Objective records and Graphite Objective stacks.

Full repo validation remains tracked as the remaining Phase 6 validation row.

## Follow-Ups

- Run full cross-language repo validation for the docs/skills slice.
- Keep the interactive Objective stack TUI parked until the JSON graph contract has more real use.
