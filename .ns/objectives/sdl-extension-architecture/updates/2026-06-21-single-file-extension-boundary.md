# Single-File Extension Boundary

## Summary

The SDL extension documentation now records the single-file extension boundary made concrete by the `changes` migration review. Direct `.sdl/extensions/<name>.ts` / `.js` modules are leaf authoring surfaces: they should import the public SDL extension API (`@sdl/sdl/sdk`) rather than SDL implementation internals, and workspace packages must never import from them.

If reusable behavior is first proven inside a single-file extension, package code must move or copy the reusable contract into a package-owned module and expose it deliberately through `@sdl/sdl/sdk` or another documented package export before depending on it.

## Objective Impact

This advances the documentation row for the emerging SDL kernel and extension SDK model without promoting any new SDK helper. The `changes` extension's local duplication remains intentional SDK-pressure evidence for this first command slice, not an invitation to depend on `.sdl/extensions/changes.ts` from package code or to expose internal SDL helpers prematurely.

The broader documentation row remains active because kernel responsibilities, project-local versus bundled extension criteria, and command-first SDK promotion rules still need a fuller narrative across the SDL docs/context surface.

## Follow-Ups

- Finish the broader SDL kernel/extension model documentation after more command slices clarify the stable author-facing terminology.
- Continue treating repeated duplication across later `cp`, `regenerate-pr`, and `submit` migrations as evidence for deliberate SDK/kernel promotion rather than as justification for internal imports.
