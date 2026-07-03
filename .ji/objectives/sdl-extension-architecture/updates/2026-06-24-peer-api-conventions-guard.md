# Peer API conventions and lightweight guard

## Summary

Architecture endgame Step 2 is now locked in docs and validation. ADR 0009 ratifies `@sdl/<cap>/api` as the required Peer API subpath for sibling capability consumption, keeps command faces separate from in-process Peer APIs, and states that package exports plus `just ts-guard` enforce the lightweight private/deep-import boundary.

The TypeScript guard now includes `SDL_TS_BAN_CAPABILITY_PRIVATE_PEER_IMPORT`, which rejects capability-to-capability imports of private/deep `src` and `internal` subpaths and undeclared capability subpaths while allowing neutral infra, `@sdl/extension-kit`, transitional `@sdl/sdl/*` internal workspace exports, and explicit future Peer API subpaths such as `@sdl/handoff/api`.

The terminology cleanup was local: `@sdl/sdl` package metadata now uses `sdl.internalWorkspaceExports`, and docs/comments use Internal workspace export terminology. Search found no runtime reader of the old metadata field; SDL's runtime aliases remain hard-coded in the module loader.

## Objective Impact

Step 2 can move to `[x]`: the cross-capability convention is documented, the command-face vs Peer API split is explicit, gateway-injected peer cores remain the rule, and a deterministic validation gate catches casual private capability imports before child capability migrations begin.

Validation evidence collected for this update:

- `just ts-guard` passed after adding the import-boundary rule and adversarial self-tests.
- `just ts-check` passed after the metadata/comment rename.
- `just ts-deps-check` passed after the `package.json` metadata rename.
- `just dprint-check` passed for changed Markdown/JSON formatting.

## Follow-Ups

- Strengthen enforcement from the current lightweight import-boundary guard to fuller topological DAG/cycle analysis only after child Objective migrations create concrete Peer API edges.
- Architecture endgame Step 3 still owns extracting SDK-independent primitives from `@sdl/sdl` into `@sdl/domain-primitives-transitional` and retiring the remaining transitional `@sdl/sdl/*` imports.
