# Herdr Optional Slot Label Enrichment Delivered

## Summary

Every Pi-hosted Herdr host now supplies a complete ns extension API factory directly to `registerHerdrPiExtension(pi, factory, options?)`; there is no generic-host or unavailable fallback. The SDK owns one canonical `createNsExtensionApi` constructor shared by CLI execution and non-CLI hosts, and `@nseng-ai/ns` owns fresh effective-project construction through `createRealNsExtensionApi`.

`/ns:herdr:space:goal`, `/ns:herdr:tab:goal`, and `/ns:herdr:space:objective-summary` handlers construct the complete API from exact `ctx.cwd` before entering Herdr core—therefore before caller targeting, validation, prompting, model work, or early returns—and at most once per invocation. Registration and unrelated commands remain lazy. The direct Pi helper calls `hasExtension("@nseng-ai/slots")` without a catch: factory, configuration, or programming failure propagates and prevents core operation and rename, while extension absence is the normal `false` result. Herdr core receives only that resolved required boolean plus narrow genuine collaborators.

Compact `s<number>:` prefixes still require both canonical managed-Slot path identity and effective `@nseng-ai/slots` presence. Extension absence or missing path identity preserves an unprefixed label; package resolution is neither fact.

Current resource-first behavior remains intact: the eleven-command catalog and optional Handoff-tab integration still register under their established contracts, `tab:new` is unchanged, and Slot-backed dispatch remains a hard dependency rather than inheriting optional label-enrichment fallback.

## Objective Impact

The Herdr roadmap row is complete. Focused fake-driven scenarios cover managed path plus presence, managed path plus absence, ordinary cwd plus presence, propagated factory failure that prevents core operation and rename, exact cwd, at-most-once construction, pre-core ordering including early-return cases, unrelated-command non-construction, required host factory wiring, and command-catalog/Handoff parity. SDK unit coverage proves complete API assembly, bound execution behavior, exact identity, option precedence, and optional-key omission; ns-host integration coverage proves effective project plus preinstalled identities and silent presentation defaults.

Implementation evidence is replacement child PR #3811, directly stacked on Objective PR #3807. Validation passed SDK, ns-host, and Herdr package typechecks; focused SDK/Herdr tests; the real ns-host integration test; every required TypeScript test lane; Objective checks; and the default repository `just` entrypoint.

## Follow-Ups

- Review and land the exact two-PR replacement stack: Objective PR #3807 followed by implementation PR #3811.
- Keep broader durable consumer accounting, `flow-slots-opt-in`, hard workflow prerequisites, Graphite-topology ownership, and final synthesis rows open until their own evidence exists.
- Revisit Herdr checkout pluggability only in a separately justified design slice; do not generalize the optional label failure policy to required workflows.
