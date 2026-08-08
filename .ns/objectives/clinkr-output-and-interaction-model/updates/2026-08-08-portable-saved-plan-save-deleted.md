# Portable Saved Plan Save Deleted

## Summary

The portable `enriched-plan exec save` command, its `--stdin` and `--content-file` modes, the `enriched-plan-save` skill and Harness Overlays, exposure/parity registration, command-specific tests, and current workflow guidance have been removed. Retained Pi implementation and test modules now use the accurate `saved-plan-commands` name.

Pi `/ns:plan:save`, `/ns:plan:grill-and-save`, `write_saved_plan_file`, `writeSavedPlanFile()`, and Saved Plan listing, resolution, selection, and attachment remain supported. Historical wayfinding records still mention the deleted names as time-in-place evidence and were not rewritten.

## Objective Impact

The second roadmap item is complete. Runner checkpoint `6feddb36a5889f448b408296ebef685d706816dd` records the deletion. The sole shared-style arbitrary Markdown payload consumer no longer exists, so the next slice can narrow the bounded shared Clinkr/SDK whole-payload surface around finite JSON requests without preserving a generic stdin contract for Saved Plans.

The runner gate passed. Child-reported focused checks included 335 tests, TypeScript typecheck, lint, formatting, and diff checks. Parent verification reran the plans and retained Pi Saved Plan command suites: 7 files and 92 tests passed. Default `just` remains blocked by pre-existing dprint drift in the unchanged Objective MCP reference.

## Follow-Ups

- Replace generic `readStdin` and SDK `stdin()` on the bounded modern structured-command path with the smallest finite JSON-specific contract.
- Preserve the command-owned Brmem/Handoff content readers and semantic line interaction identified by the inventory.
- Keep historical wayfinding documents immutable as evidence rather than treating their old names as live guidance.
