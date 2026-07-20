# ns Clinkr command ownership and defaults

## Summary

The first `flow changes` port review corrected two API-shape mistakes before the composable command surface spread further.

First, no-argument commands now omit their input schema. The SDK's single author-facing `NsClinkrCommandOptions` type treats `schema` as optional and `nsClinkrCommand(...)` supplies `z.strictObject({})` when it is absent. Catalog routing still recovers a concrete schema, but the implementation no longer needs overloads, an `Omit`-derived input shape, or a generic cast merely to default one property.

Second, the SDK adapter is now explicitly ns-owned: `nsClinkrCommand(...)` and `NsClinkrCommandOptions`. Generic Clinkr continues to own parser and presentation mechanics; the ns-qualified adapter owns the SDK-specific bundle containing catalog context, semantic events, interactions, render capabilities, format, and typed command exits.

The same review also restored `flow changes` to its established prose result instead of inventing a structured clean/dirty machine contract. PR #3793 is the current open Objective PR carrying these corrections with the lazy dependency-bound command port.

## Objective Impact

This supersedes the plain `clinkr(...)` naming decision recorded in the 2026-07-19 naming update while preserving the raw-or-Clinkr-backed execution model established by the standalone-layer collapse. The correction narrows the public claim: the SDK exports an ns command adapter over Clinkr, not a generic Clinkr combinator.

The SDK API roadmap row remains complete with a simpler authoring contract, and the `flow changes` gradient row remains complete with its pre-existing prose behavior preserved. The Objective remains open because `pull-trunk`, `submit`, measurements, and the migration verdict are still outstanding.

## Follow-Ups

- Use `nsClinkrCommand(...)` and `NsClinkrCommandOptions` for subsequent composable ports.
- Keep omitted no-input schemas covered by a unit test proving `{}` succeeds and unexpected keys fail.
- Apply the ownership distinction in future documentation and migration-verdict prose: Clinkr is generic mechanics; the ns-qualified adapter is SDK protocol.
