# SDL Single-File Extensions

Files in this directory are leaf SDL extension authoring modules.

- Import only the public SDL extension API (`@sdl/sdl/sdk`) and ordinary external/runtime packages needed by the extension.
- Do not import from `ts/packages/sdl/src/*` or other SDL implementation internals.
- Workspace packages must never import from these single-file extension modules. If package code needs behavior discovered here, move or copy the reusable contract into a package-owned module and expose it deliberately through `@sdl/sdl/sdk` or another documented package export.
