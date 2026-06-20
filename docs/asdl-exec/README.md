# Retired Python `asdl exec` Commands

The Python root `asdl exec` surface is retired. Active skill, Pi extension, and higher-level tool callers should use the TypeScript owner for each deterministic operation instead of adding new root `asdl exec` commands.

Current replacements/retirements:

- cmux workspace/sidebar summary: use [`ccc exec cmux-workspace-summary`](cmux-workspace-summary.md).
- `/enriched-plan:save` prompt policy: resolved inside the TypeScript Pi extension from `.asdl/prompts/plans-write.md` with built-in fallback.
- GitHub review-thread list/resolve commands: retired with no active higher-level caller at migration time.
