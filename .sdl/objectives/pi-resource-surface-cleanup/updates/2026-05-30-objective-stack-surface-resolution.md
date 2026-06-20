# Objective Stack Surface Resolution

## Summary

Resolved the Objective stack implementation surface and recorded the Pi extension namespace policy.

- Documented the convention that repo-owned Pi extension command families should use `/namespace:command` names when introduced or renamed, reserving `/skill:<name>` for Pi skill commands.
- Renamed the Objective Pi wrapper commands from top-level names to `/objective:list`, `/objective:gt-stacks`, `/objective:next`, `/objective:current`, `/objective:update`, and `/objective:stack-impl`.
- Converted the Objective stack implementation workflow from the public prompt template `.pi/prompts/objective-stack-impl.md` into the portable repo-owned skill `skills/objective-stack-impl/SKILL.md`, installed through `.agents/skills/objective-stack-impl` and `.claude/skills/objective-stack-impl` symlinks.
- Updated the Pi Objective wrapper so `/objective:stack-impl` loads the portable skill and injects the selected Objective slug/path, while Codex and Claude can invoke or follow `/skill:objective-stack-impl` directly.
- Removed the public project prompt template so Pi autocomplete no longer exposes a duplicate top-level `/objective-stack-impl` command.
- Updated `docs/pi/README.md`, the Objective GT stacks spec, and the historical Objective stack runner-subagent brief to reflect the namespaced wrapper and portable-skill relationship.

Fresh Pi RPC `get_commands` evidence after the change reports 74 visible commands, one each for `/objective:list`, `/objective:gt-stacks`, `/objective:next`, `/objective:current`, `/objective:update`, `/objective:stack-impl`, and `/skill:objective-stack-impl`, zero `objective-stack-impl` top-level commands, and no duplicate command names.

Fresh checked-in skill surface evidence reports `objective-stack-impl` present in `skills/`, `.agents/skills/`, and `.claude/skills/`, with `.agents/skills/objective-stack-impl -> ../../skills/objective-stack-impl` and `.claude/skills/objective-stack-impl -> ../../.agents/skills/objective-stack-impl`. `AGENTS.md` and `CLAUDE.md` both remain present as instruction surfaces.

Verification: focused Objective extension test passed; `git diff --check` passed; `just dprint-check` passed after `just dprint-fix`; `just ts-check` passed; `just ts-test` passed.

## Objective Impact

The duplicate Objective stack implementation surface is resolved rather than merely hidden. The portable core is now the repo-owned `objective-stack-impl` skill; the Pi entrypoint is the namespaced `/objective:stack-impl` picker wrapper; Codex and Claude discover the same workflow through the installed skill surfaces.

This de-risks the earlier concern that removing or renaming `/objective-stack-impl` could strand non-Pi agents without a usable Objective-stack implementation path. It also establishes the namespace convention for future Pi extension command-family cleanup without forcing every existing short command to be renamed in this slice.

The Objective remains open because `/land` still needs an explicit disposition and final post-`/land` inventory/validation evidence should be recorded before closure.

## Follow-Ups

- Decide `/land` disposition: promote/test, deprecate/replace, or retain with explicit safety rationale and Codex/Claude guidance.
- Re-run final Pi RPC command inventory and skill/instruction inventory after the `/land` disposition slice.
- Consider whether any other existing top-level Pi extension command families should be migrated to the `/namespace:command` convention in a future cleanup, without adding visible legacy aliases by default.
