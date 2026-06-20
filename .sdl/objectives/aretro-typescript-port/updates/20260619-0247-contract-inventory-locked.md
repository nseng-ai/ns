# Contract Inventory Locked

## Summary

The initial `aretro-typescript-port` Objective branch was submitted as PR #1820, then a read-only contract inventory locked the compatibility baseline needed for implementation. The inventory inspected the current Python `aretro` source and tests, `docs/aretro.md`, docs-site `aretro` and `branch-retro` pages, the public `branch-retro` skill and runner script, root workspace/build config, plugin smoke tests, `asdl-core.sessions`, `asdl-core.payloads`, and current TypeScript CLI conventions.

Durable findings:

- The active command boundary is standalone `aretro`, especially hidden-but-invocable `aretro exec collect-evidence` and `aretro exec read-evidence-detail`; root help must hide `exec` while `aretro exec --help` remains usable.
- The skill-facing JSON contract includes `success`, `error`, `repo`, `query`, `source`, `aggregate_metrics`, `sessions`, `warnings`, and `evidence_items`; payload mode additionally returns `payload_mode`, `payload_reference`, and `detail_locator_hints`.
- The evidence/diagnosis boundary is strict: deterministic CLI output remains factual and privacy-conscious, while semantic retrospective recommendations stay in the `branch-retro` skill.
- Payload detail mode preserves raw Clinkr payload artifacts with descriptor `aretro-collect-evidence`, schema version 1 data, `/data`-scoped detail pointers, and sanitized detail records that omit raw transcript, prompt, tool-output, command-output, and raw error-message text.
- The docs-site `asdl aretro --help` example is stale by default. Current skill guidance explicitly says not to use `asdl aretro`, and plugin smoke tests assert stale `aretro.plugin:build_aretro_plugin` is not mounted.
- TypeScript session-source, evidence-aggregation, and payload-store seams should start package-local in `ts/packages/aretro`; promotion to `@asdl/core` should wait for a second consumer or already-existing exported TypeScript seam.
- `just install-aretro` is the default opt-in source shim if PATH execution remains useful. Inclusion in `install-tools` requires caller evidence.
- `ASDL_ARETRO_MODE=prod` / `uvx --from aretro==0.1.0` is an audit gate before Python deletion, not a blocker for TypeScript parity work.

## Objective Impact

The Objective is now more directly implementable by a single `objective-stack-impl` invocation. The first roadmap item is complete, the locked compatibility baseline has moved into `objective.md`, and the remaining work has executable defaults for a 4–5 branch stack:

1. TypeScript package shell and contract tests.
2. Compact evidence parity.
3. Payload detail/read parity.
4. Skill/docs/distribution cutover.
5. Conditional Python retirement and umbrella Objective update.

The runner should proceed after preview unless implementation evidence contradicts the defaults or hits the explicit stop conditions: privacy ambiguity, evidence-boundary changes, new evidence kinds, registry publishing, preserving checkout-free execution through a new package, adding `aretro` to `install-tools` without caller evidence, deleting Python while active prod/`uvx` consumers remain unresolved, or validation failures needing design input.

## Follow-Ups

- Implement the remaining roadmap through `objective-stack-impl` using the single-invocation stack defaults.
- During the distribution cutover slice, grep/audit active `ASDL_ARETRO_MODE=prod`, `uvx --from aretro`, `uv run aretro`, `packages/aretro`, `asdl aretro`, and `aretro.plugin` references before Python deletion.
- When TypeScript default and Python retirement complete, update `.asdl/objectives/port-asdl-toolkit-to-typescript/` and the porting playbook with `aretro` lessons.
