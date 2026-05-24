# No Backwards Compatibility Decision

## Summary

The brmem-plans stack will not carry a backwards-compatibility layer for the old plan-branch tooling names or storage shapes.

Decisions:

- `/create-brmem-plan` is replaced by `/create-brmem-plan-branch`, not retained as a compatibility command or alias.
- `persist_brmem_plan` is replaced by a branch-specific tool such as `create_brmem_plan_branch_from_file`, not retained as a compatibility tool alias.
- Branch-stashed plans are read and written only through the canonical namespace `brmem-plans` with key `<slug>.md` on the target branch.
- Legacy base `plans/<slug>.md` and namespace `plans` entries are not auto-read, aliased, or dual-written by the new workflow.
- The branch policy prompt is renamed to `.brmem/prompts/create-brmem-plan-branch.md` with no fallback to `.brmem/prompts/dev-brmem-branch-create.md`.
- Skill names should cut over to `brmem-create-plan-branch-from-file` and `brmem-plan-impl` without keeping `dev-brmem-branch-create` or `dev-brmem-branch-impl` compatibility skills.

## Objective Impact

This completes the compatibility decision checkpoint. The first roadmap item is now complete, and implementation can proceed to the behavior-preserving extraction PR without preserving old command/tool/plugin names for compatibility.

The remaining stack should treat old names as migration targets to remove or rename, not as aliases to preserve. Tests should assert the new canonical storage and command/tool names; they do not need to prove old invocations still work.

## Follow-Ups

- Start `brmem-plans/extract-shared-plan-primitives` as the next implementation slice.
- In later slices, ensure old-name references are removed from canonical code and skill docs except where historical Objective/update prose or explicit removal notes are useful.
- Make removal failures clear enough that a user who invokes an old name can discover the new `brmem-plans` workflow.
