# Current Boundary Inventory

## Summary

Inventory found that `@sdl/aretro` is currently a standalone TypeScript Capability package with one package root export and one bin:

- `ts/packages/aretro/package.json` exposes only `".": "./src/index.ts"` and the `aretro` bin at `./src/cli.ts`; there is no `@sdl/aretro/api` subpath today.
- The public root export in `src/index.ts` is broad: it exports CLI context construction, result schemas/types, operation request/result types, `runCollectEvidence`, `runReadEvidenceDetail`, renderers, `buildCli`, `runCli`, and `VERSION`.
- `src/cli.ts` defines a standalone `aretro` command with a hidden `exec` group containing `collect-evidence` and `read-evidence-detail`. No `sdl aretro` command face was found.
- `src/context.ts` creates real gateways at the CLI edge: `RealGitGateway` via `NodeCommandExecApi` and `PiJsonlSessionSource`; tests inject `InMemoryGitGateway` and `FakeSessionSource`.
- `collect-evidence` resolves repo/branch through injected git, queries an injected session source, emits compact factual metrics/evidence, and optionally writes sanitized payload detail through `PayloadStore`.
- `read-evidence-detail` dereferences a targeted `/data...` JSON pointer from a sanitized payload artifact.
- Evidence kinds implemented match the documented deterministic boundary: `tool_usage_count`, `failed_tool_result`, `repeated_file_read`, `repeated_shell_command`, `token_usage_observed`, and `large_output_observed`.
- Tests cover CLI shape, fake-driven collect-evidence scenarios, payload mode/detail lookup, source runner behavior, session evidence aggregation, and privacy checks that raw tool/command output is not emitted.
- No TypeScript imports of `@sdl/aretro` from sibling packages were found outside Aretro's own tests/support. The concrete consumer is the `branch-retro` skill, which calls `skills/branch-retro/scripts/aretro-run` and explicitly says to use standalone `aretro exec collect-evidence`, not `sdl aretro`.
- Docs/context agree with a skill/CLI-centered product boundary: `docs/aretro.md`, `docs/pi/README.md`, and `CONTEXT-MAP.md` describe Aretro as deterministic evidence collection whose semantic judgment lives in `branch-retro`. The package README and docs-site pages are stale/placeholders relative to the implemented functionality.

## Objective Impact

The inventory supports a likely command-face-only disposition for now: there is no proven in-process consumer requiring a curated `@sdl/aretro/api` Capability API, while the skill consumer depends on standalone `aretro exec collect-evidence`. The broad package root export is the main capability-boundary risk because it can be mistaken for a supported peer API.

The inventory also confirms that Aretro already follows several desired capability rules: real git/session dependencies are created at the CLI edge, core operations accept injected context, and ordinary tests use fakes rather than real operator logs. Remaining cleanup should focus on the public command/API decision, package export shape, stale docs, and any small gateway/core refinements rather than a wholesale rewrite.

## Follow-Ups

- Decide command-face strategy next. Current evidence favors retaining standalone `aretro exec ...` at least for `branch-retro` compatibility unless a separate SDL-mounted command-face policy overrides it.
- Decide API disposition next. Current evidence favors recording “no `@sdl/aretro/api` yet” and tightening exports so the broad root is not treated as a peer Capability API.
- Refresh stale docs after the durable command/API decision, especially `ts/packages/aretro/README.md` and docs-site placeholder pages.
- When updating package exports, run focused Aretro checks/tests and any import-boundary/style guard relevant to package exports.
