# Runner subagent usage slice completed

## Summary

The TypeScript `objective` package now implements `objective exec runner-subagent-usage` for Pi runner subagent JSONL telemetry summaries.

The slice added a focused operation module that parses runner session JSONL files, reports per-session statuses (`ok`, `missing`, `not_file`, `invalid_json`, `read_error`, and `no_usage`), aggregates token and cost totals, tracks peak observed total/prompt tokens, deduplicates model references in first-seen order, and renders the Markdown table plus aggregate summary used by Objective stack digests. The hidden `exec` CLI group now exposes the command, with scenario coverage for JSON, Markdown, help, and missing-argument behavior.

A compatibility decision was made during planning: keep the Python-compatible JSON envelope for this command during the port. The broader flip to normal `@asdl/clinkr` JSON output should happen later as a coordinated retirement/cutover step after current JSON consumers are inventoried and migrated, not opportunistically in this runner slice.

Parent-side validation passed:

- `pnpm --dir ts --filter @asdl/objective run check`
- `pnpm --dir ts --filter @asdl/objective run test`
- `pnpm --dir ts run check`
- `pnpm --dir ts run test`
- `git diff --check`

`dprint check` was not applicable to the touched TypeScript paths in this repository configuration because dprint reported no matching files for those paths.

## Objective Impact

The roadmap row for `objective exec runner-subagent-usage` is now complete. The TypeScript Objective CLI has now ported the planned read/list/candidate/archive/runner deterministic command surfaces needed before the later plugin-retirement, caller/install cutover, and Python deletion gates.

The JSON-shape migration has been explicitly moved into the retirement/cutover planning surface: future work should inventory all `objective --format json` consumers, migrate or update them as needed, and then remove compatibility `legacyMachine` usage in a deliberate batch.

## Follow-Ups

- Decide and implement `asdl objective` plugin retirement or preservation with fresh grep/test evidence.
- Include JSON consumer inventory and normal `@asdl/clinkr` output cutover planning in the retirement/cutover gate.
- Continue to avoid Python deletion until TypeScript parity, caller/install migration, plugin-retirement evidence, and rollback/reference evidence are recorded.
