# Progressive Disclosure Skill References

## Summary

Refactored Objective skill guidance so standing-objective and execution-runner details are loaded through conditional references instead of ordinary Objective command skill context.

## Objective Impact

- `skills/objective/`, `skills/objective-create/`, and `skills/objective-next/` now keep ordinary bounded/planning-only workflows context-light while routing standing and execution-friendly cases to dedicated references.
- `docs/objective-system.md` now describes the updated command contracts concisely: `objective-create` defaults to planning-only unless execution policy is requested or becomes relevant, and `objective-next` remains the front door for recommend/steer/confirmed execution.
- `docs/pi/standing-objectives-and-runners.md` remains a design brief and points to skill references as the agent-facing progressive-disclosure surface.

## Follow-Ups

- Continue keeping Objective skill references concise; do not reintroduce standing/runner templates into always-loaded command skill bodies.
