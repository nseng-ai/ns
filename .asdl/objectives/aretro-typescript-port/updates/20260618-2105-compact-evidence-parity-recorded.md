# Compact Evidence Parity Recorded

## Summary

The `aretro-ts/compact-evidence` branch implements TypeScript compact evidence collection for `@asdl/aretro` against Graphite parent `aretro-ts/contract-and-shell`.

The slice adds package-local TypeScript seams for git and session sources, constructor-state fakes for tests, a real Pi JSONL session source, compact DTO conversion, aggregate metrics, warnings, and deterministic evidence aggregation for the existing factual evidence kinds: `tool_usage_count`, `failed_tool_result`, `repeated_file_read`, `repeated_shell_command`, `token_usage_observed`, and `large_output_observed`.

Privacy and boundary evidence:

- Compact summaries expose counts, source refs, bounded command subjects, and metadata rather than raw transcript text, prompts, assistant prose, tool output, command output, or raw failed-tool error text.
- Scenario and unit tests cover explicit/current branch resolution, detached and unresolved branch failures, non-git results, session-source warnings, empty sessions, DTO privacy, and the existing evidence kinds.
- Real-adapter smoke used sanitized human output only: `pnpm --dir ts exec node packages/aretro/src/cli.ts exec collect-evidence --max-sessions 1 --format human` passed against this checkout's real git and Pi session source.

Verification:

- `pnpm --dir ts --filter @asdl/aretro run check` passed.
- `pnpm --dir ts --filter @asdl/aretro run test` passed.
- `pnpm --dir ts run check` passed.
- `pnpm --dir ts run test` passed.

## Objective Impact

The roadmap rows for compact evidence collection and real-adapter smoke behavior are complete in landed-state terms. The Objective remains open because payload detail mode, `read-evidence-detail`, branch-retro skill/distribution cutover, Python retirement, and umbrella Objective/playbook updates remain active work.

Payload mode intentionally still returns a clear not-yet-implemented result in this branch; the next reviewable thesis is `aretro-ts-payload-detail`.

## Follow-Ups

- Continue with `aretro-ts-payload-detail`: schema-version-1 sanitized payload data, payload artifact writing, detail locator hints, command-subject bounding, supporting pointers, and `/data`-scoped `read-evidence-detail` validation.
- Keep the TypeScript session-source, evidence, and payload seams package-local unless a second consumer proves shared extraction is warranted.
- Do not cut over `branch-retro` or retire Python until payload parity and the distribution audit are complete.
