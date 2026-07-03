# Capability Kit Gateway Container Conversion

## Summary

`@sdl/capability-kit` has been converted into a properly formed container package. The former standalone gateway backend packages `@sdl/git`, `@sdl/github`, `@sdl/graphite`, and `@sdl/cmux` were folded into `@sdl/capability-kit` as declared subpackages: `git`, `github`, `graphite`, and `cmux`, alongside the existing kit helpers under `kit`.

The live workspace now imports these gateway surfaces through `@sdl/capability-kit/*` subpaths, and the `capability-gateway-backend` tier was retired from live style-guard and topology-report tier policy. The Graphite context moved with the folded subpackage to `ts/packages/sdl-capability-kit/src/graphite/CONTEXT.md`.

Validation evidence on branch `capability-kit-gateway-container`:

- Topology extraction: package count 38 → 34; topology circles 52 → 53.
- Folded packages no longer appear as top-level package/circle ids and reappear as `@sdl/capability-kit/git`, `@sdl/capability-kit/github`, `@sdl/capability-kit/graphite`, and `@sdl/capability-kit/cmux` circles.
- `@sdl/capability-kit` has declared `kit`, `git`, `github`, `graphite`, and `cmux` circles and no orphan source.
- Passed: `pnpm --dir ts --filter @sdl/capability-kit test`, `just ts-test-typescript-style-guard`, `just ts-format-check`, `just ts-check`, `just ts-lint`, `just ts-deps-check`, `just dprint-check`, `just ts-test`, `just ts-test-integration`, and `just`.

## Objective Impact

This completes the approved `@sdl/capability-kit` conversion row and removes four more published package identities from the workspace, advancing the end-state top-level package reduction target. It also eliminates the live `capability-gateway-backend` tier lane: gateway backend code now inherits the `capability-kit` tier as the approved inventory specified.

A temporary package-tier debt edge was recorded for `@local-pi-tools/pr-feedback-watch → @sdl/capability-kit`, because that local package now consumes the folded GitHub gateway until the later local Pi tools consolidation row retires the standalone local package.

## Follow-Ups

- Continue with the next approved conversion row in `roadmap.md`.
- The local Pi tools container conversion should remove the temporary `@local-pi-tools/pr-feedback-watch → @sdl/capability-kit` debt edge when `pr-feedback-watch` folds into `@sdl-local/pi-tools`.
