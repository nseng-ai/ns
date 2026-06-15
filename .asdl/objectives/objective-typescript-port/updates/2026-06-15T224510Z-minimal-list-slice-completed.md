# Minimal list slice completed

## Summary

The TypeScript `objective` package now includes selection-critical `objective list` behavior for minimal Objective inventory.

The slice added `objective list` support for `--minimal`, `--names`, `--status open|active|closed|all`, and JSON/Markdown/human formatting through the TypeScript CLI. The implementation preserves active-root direct-child discovery, open/closed filtering from direct `closed.md`, archive-root omission, incomplete active directory inclusion, names-only slug output, snake_case JSON envelope fields parsed by existing TypeScript consumers, filename-derived latest update facts, and dirty markers that render only in human/Markdown output.

Parent-side validation passed:

- `pnpm --dir ts --filter @asdl/objective run check`
- `pnpm --dir ts --filter @asdl/objective run test`
- `pnpm --dir ts run check`

The runner also reported a full `pnpm --dir ts run test` pass for the workspace.

## Objective Impact

The roadmap row for minimal list-mode rendering is now complete. Pi, CCC, and skill selection flows have a TypeScript package implementation target for the core active Objective inventory shape, while full branch attribution and richer non-minimal list rendering remain separate follow-up work.

The slice intentionally keeps git/dirty facts package-local and fake-backed. Shared git attribution extraction remains deferred until repeated Objective-port evidence proves reuse.

## Follow-Ups

- Continue with `objective exec list-candidates` as the next narrow hidden-command slice.
- Later full-list work should harden branch attribution and unavailable repo/trunk failure surfaces without changing the JSON fields already established for minimal selection.
- Continue preserving dirty markers as human/Markdown-only unless a later confirmed compatibility decision changes the machine contract.
