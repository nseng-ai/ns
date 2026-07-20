# Composable Command Core

## Thesis

A primitive-by-primitive value investigation of the SDK's invocation-context design (see `references/proposal-catalog-and-combinators.md` for the evidence chain) concluded that the rich per-invocation contract was solving a problem the system does not have. Every context primitive's justification reduced to in-process hosting or in-memory testing; the real Pi host boundary is seven wire-shaped fields; `textGenerator` is already a library; clinkr already owns the presentation seam; and the isolation discipline is unenforceable (the flagship `flow submit` command reaches for `node:fs` and `process.cwd()` today because the context cannot model the whole OS).

This Objective rebuilds the command-definition stack from the ground up around honest ownership:

- **ns owns the catalog.** Discovery, precedence, descriptor loading, completion wiring. The ns-only dynamic contract is `NsContext = { catalog }` — one field, the one thing only ns can answer.
- **Public command execution is raw or ns-owned Clinkr composition.** A core command definition carries either a process-shaped raw run or a directly branded `nsClinkrCommand(...)` run. ns reads the command metadata and routes it through Clinkr in-process; raw commands retain the subprocess floor. There is no standalone public hostable execution tier.
- **Services are libraries.** Model access, model policy, exec, git — ordinary imports with constructor DI at their own seams, never context fields.
- **clinkr stays generic mechanics** — surface planning, typed exits, caps, frame rendering — and stops abstracting stdout/stderr. When clinkr renders, it is in a real terminal process; non-terminal hosts consume events and typed exits and render themselves.
- **Semantic events over byte streams.** The event vocabulary and reducer stay in the SDK (the host-boundary protocol); the SDK ships the default events→terminal renderer on clinkr's `StreamSink`, hoisting the adapter layer that `flow/phase-stream/` currently hand-builds per capability.

Validated by porting real flow commands, not by design documents: the ports must come out smaller, the per-capability glue must shrink measurably, and Pi rendering must keep working through the events protocol.

## Design decisions (settled by the investigation; changing one reopens the analysis)

1. **Virtualize only what varies.** `cwd` is the one OS fact hosting changes (Pi's own extension context reached the same conclusion: `cwd` yes, `env` no). No `env` virtualization; commands and libraries read `process.env` at the edge, and tests inject env at library seams.
2. **No field without a named current consumer.** The author-facing clinkr bundle is `{ cwd, caps, events, interact, ns, format? }` — each field has a consumer identified in the traces.
3. **No byte sinks in author hands.** Command output is the typed result (rendered by the dance) plus events (including durable-output event kinds). `ClinkrIo` retreats to internal plumbing and is targeted for eventual deletion; new code takes no `ClinkrIo` dependency as the pressure test.
4. **The conversation protocol is clinkr-owned SDK plumbing, not an execution mode.** (Corrected 2026-07-19 after the standalone-tier collapse trigger fired.) A clinkr command converses in a constrained way: semantic events out (progress, notifications, previews, results — host renders), structured interactions in (host asks the user). Its bundle starts with `{ cwd, events, interact }`, where `interact` starts with exactly `confirm` and `select` and grows YAGNI-style only per named consumer. These contracts remain public because clinkr handlers need them, but they do not brand or advertise a second executable command shape.
5. **The subprocess floor.** Raw commands are normal programs — `process.cwd()`, `console.log`, own their argv — and are always executed as real processes. clinkr metadata is the sole declaration for in-process composable execution; nothing pretends an arbitrary callable is hostable.
6. **Event vocabulary lives in the SDK, not clinkr.** clinkr's genericity (`ClinkrGroup<TContext>`, string-frame `StreamSink`) is its value; an event vocabulary is opinionated workflow semantics and is the host-boundary protocol, which the SDK owns. clinkr renders frames it is handed.
7. **capability-kit owns the first-party house context.** The SDK's bundle is plumbing; the composed context first-party capabilities program against (bundle + model policy + gateways, with typed test overrides) is capability-kit's, per the platform/consumer convention.
8. **Naming (settled 2026-07-19, corrected by the collapse update and the first port review).** The ns-specific adapter is `nsClinkrCommand(...)`, with authoring options named `NsClinkrCommandOptions`; the explicit `ns` qualifier preserves Clinkr's generic identity instead of implying that SDK events, interactions, catalog context, and typed exits belong to generic Clinkr. The composable API exports `defineCommand` and `nsClinkrCommand` from `@nseng-ai/sdk/command`; the briefly introduced `hostable` export was removed when it failed to earn an executable consumer. The legacy main-surface `defineCommand` remains untouched until the migration verdict.

## Scope

- New-code pressure test for slice of decision (3): all code introduced by this Objective takes no `ClinkrIo` dependency; clinkr renderers touched along the way are refactored toward purity (return strings/frames; the process-write edge stays thin). Full `ClinkrIo` deletion trails the ports.
- The composable command API in the SDK: `defineCommand` core plus directly branded `nsClinkrCommand(...)` runs whose metadata is readable by the catalog. `NsClinkrCommandOptions` is one author-facing options type; omitted input schemas default to `z.strictObject({})`. The ns conversation types remain SDK-owned plumbing layered over generic Clinkr mechanics. The API lands beside `NsExtensionApi`; the legacy surface is untouched until the port verdict.
- SDK default events→terminal renderer built on `ProgressPhaseStateStore` + clinkr `StreamSink`, hoisted from `flow/phase-stream/`.
- Port a deliberate gradient of flow commands to the new API: `changes` (simple: git + model + report), `pull-trunk` (mid-weight), `submit` (maximal: matrix progress, model calls, the fs/`process.cwd()` leak resolved honestly).
- Before/after measurement (LoC, file count, per-capability glue) and a written verdict on migrating the remaining `NsExtensionApi` commands.

## Non-Goals

- Migrating all commands off `NsExtensionApi`. The port verdict decides whether and how that follow-up gets scoped.
- Deleting `ClinkrIo` in this Objective. New code proves life without it; deletion is a follow-up once the seven `ClinkrGroup` CLIs have a landing path.
- Subprocess hosting in Pi for raw commands. The floor stays open by construction (`run(argv, ns)` is process-entry-shaped); building Pi's spawn path is separate. Slice-3 ports are clinkr commands and run in-process.
- The full unified event vocabulary. Progress events first; notifications/messages fold in only if a ported command needs them.
- Touching the standalone `ClinkrGroup` CLIs (brmem, areg, plans, pr-feedback, retros, branch-context) beyond compatibility.
- A Pi host adapter redesign. The existing `CliCommandRunDeps` boundary keeps working; it is already approximately the wire shape this design converges on.

## Completion Criteria

1. The composable API (`defineCommand` + `nsClinkrCommand`) is exported from the SDK with command metadata visible to catalog routing, and the SDK ships the default events→terminal renderer.
2. `changes`, `pull-trunk`, and `submit` run on the new API in both hosts (ns CLI and Pi), with Pi live rendering working through the events protocol.
3. No code introduced by this Objective imports `ClinkrIo`.
4. `submit`'s port resolves the ambient fs/`process.cwd()` reach honestly (library seam with injected location, or an explicitly documented ambient boundary — not silent).
5. Before/after measurements are recorded in an update, and a written migration verdict for the remaining `NsExtensionApi` surface exists.
6. Repo validation (`just`) passes.

## Assumptions and Risks

- **Resolved — the standalone hostable tier did not earn its keep.** The `flow cp` steel thread exercised only clinkr execution, while descriptor validation and CLI routing had no contract for an independent hostable callable. The trigger fired early: the public model collapsed to raw or clinkr, and a separate tier may return only with a concrete non-clinkr consumer and settled parser/request/result contract.
- **Risk — events-as-durable-output stresses filter-style commands.** Commands whose primary output is a large byte stream (e.g. `brmem read`-shaped) may fight the events path. Slice-3 ports don't include one; the migration verdict must name how filter-style commands land (likely: they stay raw).
- **Risk — declared hostability can lie.** An `nsClinkrCommand(...)` can still import `node:fs` or touch `process.cwd()`. The declaration is a reviewable one-line promise, not a proof; `submit`'s port (completion criterion 4) sets the precedent for how ambient needs are expressed honestly.
- **Risk — coexistence entrenchment.** The new API lands beside `NsExtensionApi`; the classic strangler-fig failure is the fig that never strangles. Mitigation: the migration verdict is a completion criterion, so the Objective cannot close without a named decision about the legacy surface's future.
- **Assumption — `ClinkrGroup` absorbs the combinator plumbing cheaply.** The clinkr dance already exists (`ClinkrCommandSpec`, generic `TContext`); the new API is expected to be a thin rebinding, not a rewrite. If it turns into a parallel framework, stop and reassess.
- **Assumption — the SDK terminal renderer is a hoist, not an invention.** Most of it exists in `flow/phase-stream/`; if generalizing the matrix layout proves capability-specific, the matrix part stays in flow and only the phase renderer hoists.

## Open Questions

- The stdin/payload story for clinkr commands (dance reads the payload and delivers it through the request/schema, presumably) — settle when a ported command needs it. Interactive stdin (prompt answers) is off the table: that is the host's side of the chat seam, never the command's.
- Whether `format?` survives on the bundle or becomes a predicate once ports show the real json-suppression uses. Evidence leans keep: the objectives-extension mapping found a live consumer (runner-finish json suppression at `runner/finish.ts:329`).
- Where durable-output event kinds draw the transient/durable line (today's `onOutput` vs `stdout` distinction, restated in the vocabulary). A concrete consumer exists: runner-finish's checkpoint-markdown stdout write.
- The exact `confirm` request shape — handoffs `gc` shows it must carry preview content (today written to a `stderr` sink before prompting) so the byte sink can die; settle when an interactive command ports.
