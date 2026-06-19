# Payload Detail Parity Recorded

## Summary

The `aretro-ts/payload-detail` branch implements TypeScript payload detail parity for `@asdl/aretro` against Graphite parent `aretro-ts/compact-evidence`.

The slice adds package-local payload infrastructure for safe segment validation, environment/default payload root resolution, session-id resolution, payload reference models, private payload directory creation, raw JSON artifact writing, payload lookup, and RFC 6901 JSON Pointer resolution. `collect-evidence --payload-mode payload` now writes a raw Clinkr machine-envelope payload artifact with descriptor `aretro-collect-evidence`, schema-version-1 sanitized detail data, `payload_reference`, and `/data` locator hints. `read-evidence-detail` now accepts `--payload-path` and `--json-pointer`, validates raw successful payload envelopes and schema version 1, restricts reads to `/data`, and returns targeted values.

Privacy and compatibility evidence:

- Detail payloads include compact repo/query/source/aggregate evidence, sanitized session detail arrays, warnings, and evidence items with supporting event pointers.
- Tool results record error presence and output metrics without raw error text; command executions record bounded command subjects and output metrics without command output.
- Long command subjects are bounded with a SHA-256 prefix and truncation metadata.
- Tests cover payload artifact creation, valid targeted reads, invalid non-`/data` pointers, missing/non-success/unsupported-schema payloads, JSON Pointer escaping/index validation, and secret-output omission from payload JSON.

Verification:

- `pnpm --dir ts exec oxfmt --check 'packages/aretro/**/*.ts'` passed.
- `pnpm --dir ts --filter @asdl/aretro run check` passed.
- `pnpm --dir ts --filter @asdl/aretro run test` passed.
- `pnpm --dir ts run check` passed.
- `pnpm --dir ts run test` passed.

## Objective Impact

The roadmap row for sanitized payload detail mode and targeted detail reads is complete in landed-state terms. With compact evidence and payload parity in place, the Objective is ready for the skill/distribution cutover slice.

The Objective remains open because the `branch-retro` runner still points at the Python/repo-local legacy path, the checkout-free `prod`/`uvx` behavior has not yet been audited, active docs have not been cut over, Python retirement has not happened, and the umbrella TypeScript migration Objective has not yet recorded the final `aretro` outcome.

## Follow-Ups

- Continue with `aretro-ts-skill-distribution-cutover`: update the `branch-retro` runner and public skill/docs to prefer TypeScript for repo-local use, add or decide the `just install-aretro` source shim, and audit active `ASDL_ARETRO_MODE=prod` / `uvx --from aretro` consumers.
- Do not retire Python until skill/docs cutover, distribution evidence, and rollback/reference evidence are complete.
