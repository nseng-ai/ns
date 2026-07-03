# Kernel Command and Discovery Remediation

## Summary

Remediated the `kernel` code-smell cluster's three confirmed structural findings:

- `cli.ts` now resolves selected SDL extension commands through `resolveSelectedSdlCommand`, sharing candidate loading, diagnostic formatting, selected command path capture, and command-info refresh between normal CLI runs and completion resolver invocations while preserving their different handled exit codes.
- `extension-discovery.ts` now shares direct-entry command/diagnostic handling through `addDirectEntryCommand` for loadable root files and directory index entries.
- `command-registry.ts` now exposes `toCommandCliInfo`, and `extension-registry.ts` reuses it for catalog command infos, external candidate construction, and static command info fallback.

Validation passed: `pnpm --dir ts --filter @sdl/kernel run check`, `pnpm --dir ts --filter @sdl/kernel run test`, `just ts-format-check`, `just ts-lint`, `just ts-check`, and `just dprint-check`.

## Objective Impact

The three `references/kernel.md` findings are now dispositioned as fixed in `roadmap.md`:

- Duplicated Code in selected command resolution: fixed by the shared selected-command resolver.
- Duplicated Code in extension direct-entry discovery: fixed by the shared direct-entry command helper.
- Duplicated Code in command CLI info projection: fixed by the shared command-info projection helper.

This reduces the open, no-disposition finding count by 3 without changing SDL CLI or extension discovery behavior.

## Follow-Ups

No kernel follow-up is known. Future SDL kernel paths that need the static command-info shape should use `toCommandCliInfo` instead of rebuilding the optional field projection inline.
