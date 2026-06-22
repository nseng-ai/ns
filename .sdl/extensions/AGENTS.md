# SDL Extensions

Top-level files in this directory are leaf SDL extension authoring modules.

- Import only the public SDL extension API (`@sdl/sdl/sdk`), ordinary external/runtime packages needed by the extension, and extension-owned shared helpers under this directory.
- Do not import SDL-owned command helpers from `@sdl/sdl/*` implementation subpaths, `ts/packages/sdl/src/*`, `ts/packages/sdl-core/src/*`, or other SDL implementation internals.
- Shared extension helpers must live in a manifest directory with `package.json` containing an empty `sdl.commands` array (for example, `shared/package.json`) so extension discovery does not treat helper files as commands.
- Escalation path for duplicated command-author helpers: first copy/localize while one command proves the seam, then extract common helpers inside `.sdl/extensions/shared/` when that keeps project-local authoring readable. Promote to `@sdl/sdl/sdk` only after a later explicit decision that the helper is stable public author API.
- Workspace packages must never import from these extension modules or helper modules. If package code needs behavior discovered here, move or copy the reusable contract into a package-owned module and expose it deliberately through `@sdl/sdl/sdk` or another documented package export.
- Checked-in generated or bundled command artifacts are a liability, not the default authoring model; keep direct extension files readable unless a future bundled-extension design explicitly changes that rule.
