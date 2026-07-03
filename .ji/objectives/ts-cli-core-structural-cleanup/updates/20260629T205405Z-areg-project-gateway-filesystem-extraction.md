# Semantic Update: `@sdl/areg` Project Gateway Filesystem Extraction

## Summary

Completed the next tool-local `@sdl/areg` real-gateway decomposition slice:

- Moved `RealAregProjectGateway` and project-domain orchestration helpers into `ts/packages/tools/areg/src/gateways/project-gateway.ts`.
- Moved project filesystem/path-state and safe mutation validation helpers into `ts/packages/tools/areg/src/gateways/project-fs.ts`.
- Reduced `ts/packages/tools/areg/src/real-gateways.ts` to a compatibility export surface that still re-exports `RealAregProjectGateway` for existing callers/tests.
- Reused the shared gateway `errorInfo` helper from `gateways/errors.ts` instead of keeping a local duplicate in `real-gateways.ts`.

## Scope Notes

This was a structural refactor only. The init-vs-skill-kind mutation-policy fork, existing validation ordering, symlink/realpath safety behavior, and fake-vs-real skill-spec classifier duplication were intentionally preserved. The roadmap row remains open for the policy-collapse and classifier-sharing follow-ups.

## Validation

- `pnpm --dir ts --filter @sdl/areg test` — passed (20 files, 156 tests) before the refactor.
- `just ts-format-check` — initially failed on the new extracted files; fixed with `just ts-format-fix`.
- `just ts-format-check` — passed after autofix.
- `just ts-lint` — passed.
- `just ts-check` — passed.
- `pnpm --dir ts --filter @sdl/areg test` — passed after the refactor (20 files, 156 tests).
