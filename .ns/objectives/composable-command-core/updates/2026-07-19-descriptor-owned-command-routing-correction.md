# Descriptor-owned command routing supersedes branded runs

## Summary

The intermediate `nsClinkrCommand(...)` design recorded in `2026-07-19-ns-clinkr-command-ownership-and-defaults.md` has been superseded. Command routing now belongs to the extension descriptor: every command entry declares `kind: "ns-command"` or `kind: "raw-command"` before its lazy loader runs.

An `ns-command` module loads one flat `NsCommandDefinition`, normally created with `defineCommand(...)`. Its schema, result schema, renderer, completion, and handler metadata are direct fields; there is no nested run adapter and no runtime brand. When schema is omitted, the host supplies `z.strictObject({})` at registration. A `raw-command` module continues to load a process-shaped command that owns raw argv behavior. Literal dynamic-import thunks remain required so bundlers can discover modules lexically.

Clinkr continues to provide generic parser and presentation mechanics inside the ns host. It is not an extension-visible command kind, brand, or loaded-value classifier.

## Objective Impact

This correction preserves the Objective's raw-or-ns-hosted execution boundary while moving the routing decision to the layer that already knows the mounting contract. It removes duplicate construction-history brands and prevents catalog or host code from rediscovering execution strategy after loading.

The SDK API, Objective thesis, and roadmap now use descriptor kinds and flat `NsCommandDefinition` vocabulary. The Objective remains open: `flow pull-trunk`, `flow submit`, before/after measurements, and the migration verdict are still outstanding.

## Follow-Ups

- Port `flow pull-trunk` and `flow submit` through explicit `ns-command` descriptor entries and flat definitions.
- Record before/after measurements and the remaining-command migration verdict.
- Preserve raw/legacy parsed behavior behind explicit `raw-command` entries until that verdict decides its future.
