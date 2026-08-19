## Completion instructions
After you finish the implementation:
1. Create or update the branch commit using the repo's normal workflow.
2. Then run `!ns flow submit`.

## Launch context
This branch was created from the existing local Graphite trunk and is intentionally unrelated to the caller's current stack.

➜  clinkr git:(generic-schema-aware-argv-projection) ✗ ns flow changes
Inspecting worktree…
Resolving changes model policy…
Generating changes summary…
Outstanding changes on generic-schema-aware-argv-projection

Summary
• Updated the steelthread objective to replace command-specific argv parsing with generic schema-driven projection, and to define deterministic human output, explicit `--json` behavior, exit statuses, and `--json-schema` introspection.
• Revised the roadmap to mark the output/machine-result/introspection contract as in progress, documenting decisions for unwrapped responses, generic errors, global option placement, and lazy schema-only introspection.
• Added the decision record `.ns/objectives/clinkr-reference-cli-steelthread/updates/2026-08-19-093455-output-and-introspection-contract-decisions.md` (untracked; contents not included in the provided diff).

Files
• modified   .ns/objectives/clinkr-reference-cli-steelthread/objective.md
• modified   .ns/objectives/clinkr-reference-cli-steelthread/roadmap.md
• untracked  .ns/objectives/clinkr-reference-cli-steelthread/updates/2026-08-19-093455-output-and-introspection-contract-decisions.md
➜  clinkr git:(generic-schema-aware-argv-projection) ✗

ns flow changes should output a suggested slug for the changes