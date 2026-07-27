# README Executable Fixture Gate Complete

## Summary

The approved Clinkr README contract now has executable evidence rather than prose-only confidence. All 14 TypeScript fences in `references/README-draft.md` are byte-synchronized with live compile fixtures. The exact primary `metadata.ts`, `command.ts`, and `app.ts` example files execute through the public `createClinkrApp` interface for long and short argv options, default behavior, and stdin `--input-json --format json`; one cold-process integration smoke additionally verifies direct `import.meta.main` execution, process argv/stdin/stdout, and exit status.

The narrow production spine introduces truthful context-free/contextful command definitions, private Zod field annotations, exact root command-module decoding, schema-driven status outcome typing and validation, command-level rendering, invocation-owned one-shot stdin, the exact `human | json | md` format domain, and new-path machine-schema composition. It remains independent of the legacy mutable `ClinkrGroup` runtime.

## Objective Impact

The README-blessing roadmap gate is complete. Focused Clinkr checks and tests, the default and integration TypeScript lanes, dependency/format/lint/type/style-guard checks, and the repository `just` entrypoint pass on the implementation branch.

This slice intentionally establishes only the root filesystem default-command executable spine. The subsequent command-definition row still owns the complete independent public contract, including the raw definition variant; the topology and runtime rows still own recursive lazy routing, source composition, completion installation/provider behavior, and broader runtime qualification. No compatibility lowering or recursive topology was added to make this gate pass.

## Follow-Ups

- Complete the exact command-definition row as a reviewed standalone contract, including the explicit raw variant and any requirements not exercised by the README gate.
- Build canonical recursive lazy topology and source composition before expanding the root-only app runtime.
- Preserve the fixture synchronization and cold-process smoke as acceptance gates while later runtime work replaces the narrow spine.
