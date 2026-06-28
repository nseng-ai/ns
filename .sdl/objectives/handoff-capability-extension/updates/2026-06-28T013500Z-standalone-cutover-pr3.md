# Semantic Update: Standalone Handoff cutover PR3

## Summary

PR3 cut over the durable public Handoff command surface from the standalone `handoff` binary to the portable `sdl handoff ...` command face after SDL parity and Pi adapter alignment were present in the working tree.

## Parity evidence

- SDL command leaves are present for the full lifecycle: `sdl handoff list`, `delete`, `gc`, `create`, and `pickup` via `.sdl/extensions/handoff/package.json` and `@sdl/handoff/sdl/commands/*`.
- Handoff API/core exports include identity helpers, list/read/create/delete storage operations, and deleted-branch GC planning/execution through `@sdl/handoff/api`.
- Existing targeted evidence in this branch includes fake-backed Handoff unit tests, `packages/sdl/test/scenario/handoff-cli.test.ts`, and Pi adapter tests under `packages/hosts/pi/test`.

## Call-site inventory classification

Searches rerun for standalone `handoff` command references across `ts/packages/handoff`, `ts/packages/hosts/pi`, `docs`, `skills`, `justfile`, `.pi`, and `.sdl/extensions/handoff`.

Classifications:

- **Migrated active docs/skills**: `docs/pi/handoff-artifacts.md`, `docs/pi/README.md`, `skills/handoff*`, `skills/handoff/references/*`, `ts/packages/handoff/README.md`, `ts/packages/handoff/CONTEXT.md`, and `CONTEXT-MAP.md` now present `sdl handoff ...` as the portable command face.
- **Migrated package/Pi metadata**: `ts/packages/hosts/pi/src/handoff/registration.ts` parity text now names `sdl handoff create|pickup|list` and Handoff API behavior instead of a standalone CLI-over-brmem workflow.
- **Removed standalone implementation/tests**: package bin metadata, `ts/packages/handoff/src/cli.ts`, standalone CLI scenario tests, and the standalone CLI scenario harness were removed.
- **Removed shim/install surface**: `just install-handoff` was deleted and `install-tools` no longer installs or reports `handoff`.
- **Retained historical/provenance mentions**: ADR/audit references such as `docs/adr/0014-clinkr-confirmation-danger-tiers.md`, `docs/cli-surface-conformance-audit.md`, and closed/older Objective records remain historical and were not rewritten as active command guidance.
- **Retained non-standalone Handoff terms**: Pi slash commands (`/handoff:*`), skills (`handoff-create`, `handoff-pickup`), namespace/key vocabulary, tests, and generic handoff artifact prose remain because they are not calls to the standalone binary.

## Standalone removal evidence

- `ts/packages/handoff/package.json` no longer declares `bin.handoff`.
- `ts/packages/handoff/src/cli.ts` is deleted.
- Obsolete standalone CLI shape/list/delete/gc scenario tests and support harness are deleted; parity now lives in Handoff core/unit tests plus SDL command scenario tests.
- `justfile` no longer offers `install-handoff` and no longer includes `handoff` in `install-tools`.

## Alias decision

No active repo-local script, Pi adapter, or skill requires standalone `handoff` short aliases `-y` or `-f`. Alias hits are historical ADR/audit prose or SDL scenario test titles, not active blockers. PR3 intentionally did not add short aliases to `sdl handoff delete` or `sdl handoff gc`.

## Compatibility preserved

The cutover did not change the Handoff Branch Memory namespace (`handoff`), flat `<slug>.md` key shape, slug validation contract, branch-scoped storage model, all-branches inventory behavior, deleted-branch GC semantics, or the no-`/handoff:delete` Pi policy.

## Validation

- `just ts-deps-check`
- `just ts-format-check`
- `just ts-check`
- `just ts-guard`
- `pnpm --dir ts exec vitest run --config vitest.config.ts packages/handoff/test packages/sdl/test/scenario/handoff-cli.test.ts packages/hosts/pi/test`
- `just dprint-check` after `just dprint-fix` formatted `docs/pi/README.md`
