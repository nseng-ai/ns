# SDL Extensions

This directory contains repo-local SDL extension packages and, where needed for compatibility tests, direct leaf command modules.

- The canonical lifecycle command package is `.sdl/extensions/flow/`, whose manifest declares `sdl.group = "flow"` and whose command entries live under `flow/src/commands/`.
- Import only the public SDL extension API (`sdl-sdk`), ordinary external/runtime packages needed by the extension, and extension-owned shared helpers under the owning manifest package.
- Do not import SDL-owned command helpers from `@sdl/sdl/*` implementation subpaths, `ts/packages/sdl/src/*`, `ts/packages/infra/core/src/*`, or other SDL implementation internals.
- Shared extension helpers live under the owning implementation package (for example, `ts/packages/capabilities/flow/src/shared/` in the `sdl-flow` workspace package) so extension discovery does not treat helper files as commands.
- Escalation path for duplicated command-author helpers: first extract common helpers inside the owning extension implementation package; only promote them to `sdl-sdk` after multiple extensions have proven the API shape and we deliberately want it as public author API.
- Capability-area maturity ladder for the grouped flow package: start with command-local raw logic; extract repeated command-author mechanics to flow-owned helpers under `ts/packages/capabilities/flow/src/shared/`; route stable package-owned behavior through documented `@sdl/sdl/*` internal-migration-export subpaths when the implementation belongs in a workspace package; promote to public `sdl-sdk` only after a separate explicit SDK decision.
- Workspace packages must never import from these extension modules or helper modules. If package code needs behavior discovered here, move or copy the reusable contract into a package-owned module and expose it deliberately through `sdl-sdk` or another documented package export.
- Checked-in generated or bundled command artifacts are a liability, not the default authoring model; keep direct extension files readable unless a future bundled-extension design explicitly changes that rule.
