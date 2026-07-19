# Composable Command Core

## Thesis

A primitive-by-primitive value investigation of the SDK's invocation-context design (see `references/proposal-catalog-and-combinators.md` for the evidence chain) concluded that the rich per-invocation contract was solving a problem the system does not have. Every context primitive's justification reduced to in-process hosting or in-memory testing; the real Pi host boundary is seven wire-shaped fields; `textGenerator` is already a library; clinkr already owns the presentation seam; and the isolation discipline is unenforceable (the flagship `flow submit` command reaches for `node:fs` and `process.cwd()` today because the context cannot model the whole OS).

This Objective rebuilds the command-definition stack from the ground up around honest ownership:

- **ns owns the catalog.** Discovery, precedence, descriptor loading, completion wiring. The ns-only dynamic contract is `NsContext = { catalog }` — one field, the one thing only ns can answer.
- **Presentation and hostability are additive, composable overlays** on a core command definition, expressed as combinators (`hostable(...)`, `clinkr(...)`) over one `defineCommand`, not as parallel definer surfaces. The catalog reads capability metadata off the brands; hosts route mechanically (declared-hostable → in-process; otherwise → spawn, always safe).
- **Services are libraries.** Model access, model policy, exec, git — ordinary imports with constructor DI at their own seams, never context fields.
- **clinkr stays generic mechanics** — surface planning, typed exits, caps, frame rendering — and stops abstracting stdout/stderr. When clinkr renders, it is in a real terminal process; non-terminal hosts consume events and typed exits and render themselves.
- **Semantic events over byte streams.** The event vocabulary and reducer stay in the SDK (the host-boundary protocol); the SDK ships the default events→terminal renderer on clinkr's `StreamSink`, hoisting the adapter layer that `flow/phase-stream/` currently hand-builds per capability.

Validated by porting real flow commands, not by design documents: the ports must come out smaller, the per-capability glue must shrink measurably, and Pi rendering must keep working through the events protocol.

## Design decisions (settled by the investigation; changing one reopens the analysis)

1. **Virtualize only what varies.** `cwd` is the one OS fact hosting changes (Pi's own extension context reached the same conclusion: `cwd` yes, `env` no). No `env` virtualization; commands and libraries read `process.env` at the edge, and tests inject env at library seams.
2. **No field without a named current consumer.** The author-facing clinkr bundle is `{ cwd, caps, events, confirm?, format? }` — each field has a consumer identified in the traces.
3. **No byte sinks in author hands.** Command output is the typed result (rendered by the dance) plus events (including durable-output event kinds). `ClinkrIo` retreats to internal plumbing and is targeted for eventual deletion; new code takes no `ClinkrIo` dependency as the pressure test.
4. **`hostable` is a chat seam, not a byte pipe.** (Sharpened 2026-07-19 from the earlier events-only `{ cwd, events, confirm? }` framing.) A hostable command converses in a constrained way: semantic events out (progress, notifications, previews, results — host renders), structured interactions in (host asks the user). Contract: `{ cwd, events, interact }`, where `interact` starts with exactly `confirm` (message + embedded preview + default) and `select` — grown YAGNI-style only per named consumer, same discipline as the event vocabulary. Both directions are host-boundary protocol owned by the SDK. clinkr and the Pi runtime are two renderers of the same conversation (terminal frames + stderr/stdin prompts vs. Pi widgets + dialogs). `clinkr(spec)` returns a hostable run — "clinkr implies hostable" is a return type, not doctrine.
5. **The subprocess floor.** Un-overlaid (raw) commands are normal programs — `process.cwd()`, `console.log`, own their argv — and are always executed as real processes. Nothing pretends otherwise; hostability is declared, reviewable metadata, not vigilance.
6. **Event vocabulary lives in the SDK, not clinkr.** clinkr's genericity (`ClinkrGroup<TContext>`, string-frame `StreamSink`) is its value; an event vocabulary is opinionated workflow semantics and is the host-boundary protocol, which the SDK owns. clinkr renders frames it is handed.
7. **capability-kit owns the first-party house context.** The SDK's bundle is plumbing; the composed context first-party capabilities program against (bundle + model policy + gateways, with typed test overrides) is capability-kit's, per the platform/consumer convention.
8. **Naming (settled 2026-07-19).** The combinator is `clinkr(...)` — honest implementation naming; clinkr is first-party and owns the presentation seam, and its types become SDK-grade public API knowingly. The composable API exports `defineCommand`, `hostable`, `clinkr` under their plain names from a new SDK subpath `@nseng-ai/sdk/command` (`ts/packages/sdk/src/command/`), leaving the legacy main-surface `defineCommand` untouched so the from-scratch API is judged on its merits. Legacy name takeover (renaming/removing the old `defineCommand`) is deferred to full-codebase migration time, scoped by the migration verdict.

## Scope

- New-code pressure test for slice of decision (3): all code introduced by this Objective takes no `ClinkrIo` dependency; clinkr renderers touched along the way are refactored toward purity (return strings/frames; the process-write edge stays thin). Full `ClinkrIo` deletion trails the ports.
- The composable command API in the SDK: `defineCommand` core (`run(argv, ns)`), `hostable(...)` and `clinkr(...)` combinators, capability brands readable from the catalog. Lands beside `NsExtensionApi`; the legacy surface is untouched until the port verdict.
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

1. The composable API (`defineCommand` + `hostable` + `clinkr`) is exported from the SDK with brands visible in catalog metadata, and the SDK ships the default events→terminal renderer.
2. `changes`, `pull-trunk`, and `submit` run on the new API in both hosts (ns CLI and Pi), with Pi live rendering working through the events protocol.
3. No code introduced by this Objective imports `ClinkrIo`.
4. `submit`'s port resolves the ambient fs/`process.cwd()` reach honestly (library seam with injected location, or an explicitly documented ambient boundary — not silent).
5. Before/after measurements are recorded in an update, and a written migration verdict for the remaining `NsExtensionApi` surface exists.
6. Repo validation (`just`) passes.

## Assumptions and Risks

- **Risk — the hostable middle tier fails to earn its keep.** The investigation twice concluded "raw or clinkr" suffices; the tier was reinstated for composability. Partially de-risked 2026-07-19: the chat-seam sharpening (decision 4) names the consumer path — Pi hosting interactive commands in-process, replacing per-capability hand-built Pi UI glue (handoffs' `pi/` is ~30 files of it; herdr similar) with one generic chat-seam renderer. Still open until a port proves it: if no non-clinkr consumer of `hostable(...)` exists by the port verdict, collapse it into the clinkr combinator's internals rather than shipping an unconsumed public tier.
- **Risk — events-as-durable-output stresses filter-style commands.** Commands whose primary output is a large byte stream (e.g. `brmem read`-shaped) may fight the events path. Slice-3 ports don't include one; the migration verdict must name how filter-style commands land (likely: they stay raw).
- **Risk — declared hostability can lie.** A `clinkr(...)` command can still import `node:fs` or touch `process.cwd()`. The declaration is a reviewable one-line promise, not a proof; `submit`'s port (completion criterion 4) sets the precedent for how ambient needs are expressed honestly.
- **Risk — coexistence entrenchment.** The new API lands beside `NsExtensionApi`; the classic strangler-fig failure is the fig that never strangles. Mitigation: the migration verdict is a completion criterion, so the Objective cannot close without a named decision about the legacy surface's future.
- **Assumption — `ClinkrGroup` absorbs the combinator plumbing cheaply.** The clinkr dance already exists (`ClinkrCommandSpec`, generic `TContext`); the new API is expected to be a thin rebinding, not a rewrite. If it turns into a parallel framework, stop and reassess.
- **Assumption — the SDK terminal renderer is a hoist, not an invention.** Most of it exists in `flow/phase-stream/`; if generalizing the matrix layout proves capability-specific, the matrix part stays in flow and only the phase renderer hoists.

## Open Questions

- The stdin/payload story for clinkr commands (dance reads the payload and delivers it through the request/schema, presumably) — settle when a ported command needs it. Interactive stdin (prompt answers) is off the table: that is the host's side of the chat seam, never the command's.
- Whether `format?` survives on the bundle or becomes a predicate once ports show the real json-suppression uses. Evidence leans keep: the objectives-extension mapping found a live consumer (runner-finish json suppression at `runner/finish.ts:329`).
- Where durable-output event kinds draw the transient/durable line (today's `onOutput` vs `stdout` distinction, restated in the vocabulary). A concrete consumer exists: runner-finish's checkpoint-markdown stdout write.
- The exact `confirm` request shape — handoffs `gc` shows it must carry preview content (today written to a `stderr` sink before prompting) so the byte sink can die; settle when an interactive command ports.
