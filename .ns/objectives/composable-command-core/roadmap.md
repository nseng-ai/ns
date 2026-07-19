# Roadmap

## Work

- [ ] Establish the no-`ClinkrIo` pressure test and purity direction in clinkr
  - New code introduced by this Objective takes no `ClinkrIo` dependency; renderers touched along the way return strings/frames with a thin process-write edge. `StreamRenderTarget` stays as the narrow live-stream test seam.
  - Evidence: a lint-level or review-level guard (or a bounded search recorded in an update) shows no new `ClinkrIo` imports; touched renderers have pure-function tests.

- [ ] Ship the composable command API in the SDK
  - `defineCommand({ name, summary, run })` core with `run(argv, ns)` and `NsContext = { catalog }`; `hostable(...)` overlay with the chat-seam contract `{ cwd, events, interact }` (`interact` = `confirm` + `select` only, per design decision 4); `clinkr({ schema, resultSchema, completions?, handler })` combinator returning a hostable run, handler bundle `{ cwd, caps, events, interact, format? }`.
  - Implemented as a thin rebinding over the existing `ClinkrCommandSpec` dance; brands readable from catalog metadata; lands beside `NsExtensionApi` untouched.
  - Naming settled (design decision 8): exports `defineCommand` / `hostable` / `clinkr` under plain names from new subpath `@nseng-ai/sdk/command` (`ts/packages/sdk/src/command/`); the subpath doubles as the no-`ClinkrIo` pressure-test boundary. Legacy name takeover deferred to the migration verdict.
  - Evidence: SDK unit/type tests cover brand metadata, combinator composition (clinkr-implies-hostable as return type), and bundle field consumers; no `ClinkrIo` imports.

- [ ] Hoist the default events→terminal renderer into the SDK
  - Built on `ProgressPhaseStateStore` + clinkr `StreamSink`; hoisted from `flow/phase-stream/` (phase renderer first; matrix generalizes only if it proves capability-agnostic).
  - Evidence: SDK renderer tests pass; flow can consume the hoisted renderer without behavior change.

- [ ] Port `flow changes` (simple gradient point)
  - Git + model + report command on the new API: services as library imports (git gateway, model policy, text generation), output as typed result + progress events.
  - Evidence: works in ns CLI and Pi; scenario tests in-memory; before/after size recorded.

- [ ] Port `flow pull-trunk` (mid-weight gradient point)
  - Evidence: works in both hosts; before/after size recorded.

- [ ] Port `flow submit` (maximal gradient point)
  - Matrix progress through the events protocol; model calls via libraries; the fs/`process.cwd()` failure-log reach resolved honestly (injected location seam or documented ambient boundary).
  - Evidence: Pi live matrix rendering works; the ambient-reach resolution is written down; before/after size and `phase-stream/` glue shrinkage recorded.

- [ ] Record measurements and write the migration verdict
  - Before/after LoC and file counts for the three ports; `flow/phase-stream/` glue delta; a written verdict on migrating the remaining `NsExtensionApi` commands, including how filter-style (byte-stream) commands land and whether the `hostable` middle tier earned independent consumers.
  - Evidence: update in `updates/` with the numbers and the verdict; completion criteria checked.

## Parked

- Full `ClinkrIo` deletion (follow-up once the seven `ClinkrGroup` CLIs have a landing path).
- Migrating the remaining `NsExtensionApi` commands (scoped by the migration verdict).
- Pi subprocess execution for raw (un-overlaid) commands — the floor stays open by construction; building the spawn path is separate.
- Unified event vocabulary beyond progress (notifications/messages) and interaction kinds beyond `confirm`/`select` — fold in only when a ported command needs them (chat-seam in-direction grows YAGNI-style, per design decision 4).
- Interactive-command port (e.g. `handoff gc`) as a chat-seam gradient point, and Pi hosting hostable commands through a generic chat-seam renderer (replacing per-capability `pi/` UI glue) — candidate follow-up scoped by the migration verdict; the three flow ports remain this Objective's validation set.
- `env` curation at any boundary — reintroduce only with a named host that actually curates.
- Cancellation seam (`AbortSignal`) — additive later if a hosted runtime needs it.
