# Semantic Update: Add proto Objective implementation skill

## Summary

The prototype runner now has a local internal skill scaffold. `skills/proto-objective-impl/SKILL.md` defines the v1 runner contract for one selected Objective: explicit Objective resolution, context compaction, autonomy-designed versus human-assisted mode selection, upfront preview and confirmation, serial subagent execution, keep/discard/materialization rules, Objective tracking boundaries, and preview-scoped PR submission.

The local skill installation wiring was added through the standard skill layout: `.agents/skills/proto-objective-impl` points to `../../skills/proto-objective-impl`, `.claude/skills/proto-objective-impl` points to `../../.agents/skills/proto-objective-impl`, and `skills-lock.json` records `source: "skills/proto-objective-impl"`.

Verification passed: `dprint check skills/proto-objective-impl/SKILL.md skills-lock.json`, plus direct symlink resolution checks for the `.agents` and `.claude` entries.

## Objective Impact

This completes the roadmap row **Add the `proto-objective-impl` internal skill**. The skill keeps the prototype isolated from canonical Objective behavior: it forbids Objective schema/lifecycle changes, hidden ledgers, task databases, and default PR submission, while documenting how a parent runner should make bounded, evidence-backed progress.

## Follow-Ups

- Implement the `/proto:objective-impl` wrapper/picker and targeted tests.
- Keep the prototype out of existing `/objective:*` behavior while adding the opt-in command surface.
