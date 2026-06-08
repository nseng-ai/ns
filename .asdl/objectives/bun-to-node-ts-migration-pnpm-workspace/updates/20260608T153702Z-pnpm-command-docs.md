# pnpm Command Documentation

## Summary

Active command documentation now reflects the pnpm workflow for user-facing and agent-facing TypeScript commands.

Changed files:

- `ts/packages/asdl-dev/README.md` replaces the stale `bun run --cwd ts asdl-dev ...` fallback and submit examples with `pnpm --dir ts run asdl-dev ...` commands.
- `ts/packages/asdl-dev/README.md` documents the migrated TypeScript workspace baseline: Node `>=24.12.0` and pnpm `>=10.14.0`.
- `docs/pi/planned-branch-workflow.md` no longer says the `justfile` wraps an underlying Bun invocation; it now describes the `justfile` as the validation source of truth delegating TypeScript package-manager work through the `ts/` pnpm workspace.
- `.asdl/objectives/bun-to-node-ts-migration-pnpm-workspace/roadmap.md` marks the command-documentation row complete with evidence and scope boundaries.

The implementation intentionally documents `pnpm --dir ts run asdl-dev ...` without a `--` separator. Local pnpm 10.14.0 echoed `pnpm --dir ts run asdl-dev -- submit --help` as `node packages/asdl-dev/src/cli.ts -- submit --help`, so the separator would be forwarded to the CLI rather than consumed by pnpm for this script shape.

## Objective Impact

The pnpm command-documentation roadmap row is complete. Active `asdl-dev` docs now show the pnpm fallback shape for environments where an installed `asdl-dev` binary is not on `PATH`, while preserving installed-binary examples for loaded repo environments.

The planned-branch workflow documentation now matches the current validation surface: `justfile` remains the source of truth for docs and TypeScript validation commands, and TypeScript package-manager work is delegated through the `ts/` pnpm workspace.

Validation evidence:

- `node --version` -> `v24.2.0`.
- `pnpm --version` -> `10.14.0`.
- Focused stale-reference search found no `bun run --cwd ts`, `bun install --cwd ts`, `bun run --cwd docs-site`, `bun install --cwd docs-site`, or `underlying Bun invocation` matches in the active docs inspected for this slice.
- Positive search found the pnpm `asdl-dev` fallback/examples, Node/pnpm baseline docs, planned-branch pnpm workspace wording, and existing docs-site pnpm deployment commands.
- `just dprint-check` passed.
- `pnpm --dir ts run asdl-dev --help`, `pnpm --dir ts run asdl-dev submit --help`, and `pnpm --dir ts run asdl-dev preview-url --help` exited successfully and showed pnpm forwarding the documented argument shape, with the expected unsupported-engine warnings under local Node `v24.2.0`.
- Direct `runCli` imports printed top-level, `submit`, and `preview-url` help text, confirming CLI parsing independent of the local direct `.ts` entrypoint behavior.

`ts/` remains a pnpm workspace, `docs-site/` remains a standalone pnpm-managed docs surface, and the repository root remains orchestration-only. No root `package.json`, root `pnpm-workspace.yaml`, or docs-site workspace-folding change was introduced.

## Follow-Ups

- Package-local `bun test --sequential` scripts remain transitional Vitest migration work and were not changed.
- Broad historical/template Bun-reference cleanup remains sibling/later Objective work and was not attempted.
- Direct TypeScript CLI entrypoint hardening under Node remains outside this docs-only slice; local Node `v24.2.0` emitted experimental type-stripping warnings during help smoke checks.
