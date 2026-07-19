# Semantic Update: composable `flow cp` command API steel thread

## Summary

The first executable composable-command vertical is `ns flow cp`.

- `@nseng-ai/sdk/command` now exports plain `defineCommand`, `hostable`, and `clinkr` names beside the untouched legacy SDK-root `defineCommand`.
- The SDK surface owns collision-safe composable/hostable/clinkr metadata, `NsContext = { catalog }`, the read-only `CatalogView.has(...)` projection, progress-event sinks, and the minimum host-neutral `confirm` / `select` interaction protocol. Non-interactive adapters return explicit `unavailable` results.
- Descriptor validation recognizes composable commands explicitly and the ns CLI mounts their clinkr metadata directly in its root `ClinkrGroup`.
- Capability-kit owns `FirstPartyCommandContext` and its real composition factory. It carries only the cp-demonstrated environment, text-generation, command-runner, Git, and Graphite collaborators; invocation facts remain in the SDK bundle.
- `flow cp` moved from the flat `commands/cp.ts` declaration to `commands/cp/command.ts`, establishing the per-command-folder convention for migrated commands. Remaining flat commands are deliberate follow-up work.

## Before and after

The previous cp declaration/core wrapper was one 145-line file. The migrated declaration/core remains one file at 156 lines. The small increase buys the first public API exemplar and removes the declaration's dependency on `NsExtensionApi`; shared SDK, capability-kit, and host plumbing is reusable by subsequent ports.

## Objective Impact

The ns CLI routes branded cp in-process, preserving help, JSON Schema, `--dry-run` / `-n`, typed exits, result rendering, and failures. Pi remains on its existing `runNsCli` delegation path; SDK progress events still reach that path.

Terminal/plain hosted phase rendering remains temporarily backed by Flow's existing settled-phase stream through a narrow live-output compatibility field on the hostable bundle. This is not the generic SDK events-to-terminal renderer and does not complete that roadmap row. Its removal target is the planned default renderer hoist.

## Follow-Ups

- The generic typed context crossed definition, descriptor validation, host routing, and cp execution without an SDK-to-capability-kit dependency, dynamic extension key, module global, or untyped service bag.
- `clinkr(...)` remains metadata consumed by the existing root CLI rather than a second parser/framework.
- The hostable middle tier is exercised transitively because clinkr implies hostable, but this slice still does not prove an independent non-clinkr hostable consumer.
- The no-`ClinkrIo` boundary is demonstrated by the new `sdk/src/command/` surface and cp declaration; full deletion remains parked.
- Pi evidence is existing-path compatibility, not direct generic Pi hosting.
