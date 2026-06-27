# Pi→CCC Manifest/Parity Cleanup

## Summary

Removed the final scoped Pi-side stale `@sdl/ccc` references: `@sdl/pi` no longer declares `@sdl/ccc` in `ts/packages/hosts/pi/package.json`, `ts/pnpm-lock.yaml` no longer lists `@sdl/ccc` under the `packages/hosts/pi` importer, and the Pi parity-scope comment no longer mentions the CCC package boundary.

Stale-edge gate evidence:

```bash
rg "@sdl/ccc" ts/packages/hosts/pi/src ts/packages/hosts/pi/package.json
```

produced no matches.

Validation passed:

```bash
pnpm --dir ts --filter @sdl/pi run check
pnpm --dir ts --filter @sdl/pi test
just ts-deps-check
just ts-guard
pnpm --dir ts run check
```

`pnpm --dir ts --filter @sdl/pi test` passed 72 files / 924 tests. The pnpm install steps still warn about existing cyclic workspace dependencies involving `autobranch`, `pi`, and `sdl`; this update only completes the scoped Pi→CCC stale-edge row.

## Objective Impact

The Pi→CCC cycle-break roadmap row is now complete under the accepted direction: `@sdl/ccc` may consume neutral `@sdl/pi` helper subpaths, but `@sdl/pi` no longer imports or declares `@sdl/ccc` in the scoped Pi source/package gate.

This does not close the Objective. The Objective still needs the parked acyclicity guard, thermonuclear review, and final context documentation/closure evidence.

## Follow-Ups

- Implement the parked `just ts-guard` topological acyclicity check for the Extension Dependency Graph with acyclic-pass and synthetic-cycle-fail self-tests.
- Run the thermonuclear review pass after the acyclicity guard.
- Write final `ts/packages/objective/CONTEXT.md` / `CONTEXT-MAP.md` documentation and closure evidence after review outcomes are resolved or explicitly accepted.
