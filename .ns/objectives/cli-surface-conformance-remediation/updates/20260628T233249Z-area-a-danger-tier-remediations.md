# Area (a) danger-tier remediations landed

## Summary

Landed the currently listed Area (a) danger-tier remediation slice for human-facing destructive or user-environment-writing CLI commands. The implementation keeps ADR 0015's hidden `exec` no-prompt carve-out intact and applies canonical `--yes` / `-y`, Clinkr interactivity gating, and non-interactive flag-naming behavior to the scoped commands.

Implemented command-local changes:

- `brmem delete` now has `--yes` / `-y`, `ClinkrInteraction` in context and tests, non-interactive `usageError` data naming `--yes`, interactive confirm/decline/abort behavior, and an explicit cancelled result shape.
- `sdl shell install` now gates rc-file marker writes behind `--yes` / `-y` or an interactive Clinkr confirmation, with cancelled result data for declined prompts.
- `areg init` and `areg skill apply` now use `ClinkrInteraction` for the in-scope confirmation seams instead of the private prompt gateway; non-interactive callers get `usageError` data naming `--yes`.
- `packagechk claim-pypi` and `claim-npm` now use `yes` in the request schema and `--yes` / `-y` in help; `--skip-confirmation` is removed in this slice. Because these commands remain raw-exit finite-result surfaces, missing non-interactive confirmation returns exit 2 and stderr naming `--yes` rather than a Clinkr JSON envelope.
- `slot free --all` now uses `requireInteractiveOrUsageError(repoCtx.interaction, ...)` for authorization instead of `ctx.shouldWriteCdDirective`; progress/presentation still uses `shouldWriteCdDirective` where appropriate.
- `@sdl/clinkr/raw`'s `rawCommand(...)` helper now accepts the existing `RawCommandSpec.options` surface so raw commands can register short options such as `-y` without bypassing the framework parser.

Validation evidence:

```bash
pnpm --dir ts exec vitest run \
  packages/infra/brmem/test/scenario/delete-operation.test.ts \
  packages/tools/packagechk/test/scenario/claim.test.ts \
  packages/tools/areg/test/scenario/init-cli.test.ts \
  packages/tools/areg/test/scenario/skill-apply-cli.test.ts \
  packages/capabilities/slot/test/scenario/free-cli.test.ts \
  packages/kernel/test/scenario/shell-cli.test.ts
# passed

just ts-format-check
# passed after just ts-format-fix

just ts-lint
# passed with pre-existing warnings only

just ts-check
# passed
```

## Objective Impact

- Roadmap Area (a) moves to `[x]` for the currently listed human-facing gaps: `brmem delete`, `sdl shell install`, `areg init`, `areg skill apply`, `packagechk claim-*`, and `slot free --all`.
- The raw-mode caveat for `packagechk` remains parked for Area (c): Area (a) is satisfied for flag naming and non-interactive safety, but full enveloped finite-result migration is still outside this slice.
- The current-source reconciliation row remains `[~]` because Areas (d), (c), and (b) still require row-by-row probes before claiming broader conformance.

## Follow-Ups

- Continue with Area (d) exit-semantics remediation after re-verifying current source rows.
- Track packagechk's raw finite-result envelope migration under Area (c) / raw-exit conformance rather than reopening Area (a).
- Do not retrofit confirmation prompts onto hidden `exec` write surfaces unless ADR 0015 is superseded.
