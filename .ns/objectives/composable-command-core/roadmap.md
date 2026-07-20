# Roadmap

## Work

- [x] Steel-thread the composable API through `flow cp`
  - `cp` is the first per-command-folder exemplar (`commands/cp/command.ts`) and runs through an explicit descriptor `ns-command` route as a flat dependency-bound definition.
  - `cp` now emits SDK phase events only; terminal rendering is composed at the SDK CLI host edge while live/Pi hosts receive the same semantic events without a duplicate terminal frame. This does not replace the planned `changes` / `pull-trunk` / `submit` gradient.
  - Evidence: SDK API/brand tests, Flow cp scenarios and core tests, real-loader integration, and bounded no-`ClinkrIo` / no-`NsExtensionApi` searches.

- [x] Establish the no-`ClinkrIo` pressure test and purity direction in clinkr
  - New code introduced by this Objective takes no `ClinkrIo` dependency; renderers touched along the way return strings/frames with a thin process-write edge. `StreamRenderTarget` stays as the narrow live-stream test seam.
  - Evidence: bounded searches recorded with the cp steel thread and renderer hoist show no `ClinkrIo` imports in the new command surface or migrated cp command; renderer behavior has direct unit coverage.

- [x] Ship the descriptor-owned ns command API in the SDK
  - Descriptor entries form an explicit `kind: "ns-command" | "raw-command"` union. The route survives lazy loading, and malformed modules fail according to the declared kind rather than falling through to another execution strategy.
  - `defineCommand({ name, summary, schema?, resultSchema, handler, ... })` returns one flat `NsCommandDefinition`; the ns command bundle owns `{ cwd, caps, events, interact, ns, format? }` conversation plumbing. There is no nested run adapter, runtime command brand, `DefinedCommand`, or executable “composable” variant.
  - Omitted input schemas become `z.strictObject({})` at the single ns-command registration boundary. Clinkr remains generic mechanics used by the ns host, while legacy process-shaped commands stay behind the explicit `raw-command` route. Legacy name takeover remains deferred to the migration verdict.
  - Evidence: SDK unit/type/scenario coverage exercises both descriptor variants, variant-specific load validation, flat definition inference, strict empty-schema defaulting, explicit unavailable interactions, and selected-only loading; no `ClinkrIo` imports.

- [x] Hoist the default phase events→terminal renderer into the SDK
  - Built on `ProgressPhaseStateStore` + clinkr `StreamSink`; the SDK CLI host edge owns phase checklist frames and forwards semantic events instead when a live host is present.
  - The hoist is deliberately phase-only: Flow still owns `CP_PHASES` and all other phase specifications, matrix rendering/controllers, submit/land orchestration, transcript tails, and its legacy phase-stream driver for unported commands.
  - Evidence: SDK renderer tests cover non-TTY, TTY, failure, and live forwarding without duplicate output; Flow cp scenarios preserve result and phase presentation behavior; bounded ownership searches show no composable `onOutput`, cp byte bridge, new `ClinkrIo`, or Flow matrix/spec vocabulary in the renderer.

- [x] Port `flow changes` (simple gradient point)
  - The command now uses the first-party composable API with explicit Git, model-policy, and text-generation seams; its result remains the bounded prose report rather than introducing a new structured machine contract.
  - The no-argument callsite omits `schema` and receives the SDK's strict empty-object default. Three SDK phases preserve inspect, policy, and generation progress, with policy/generation explicitly settled as not required for clean worktrees.
  - Evidence: in-memory command scenarios, real-loader human/JSON/JSON-schema integration coverage, existing Pi delegation coverage, bounded legacy-dependency searches, and `just`; implementation is split into a lazy command factory and dependency-bound implementation module.

- [ ] Port `flow pull-trunk` (mid-weight gradient point)
  - Evidence: works in both hosts; before/after size recorded.

- [ ] Port `flow submit` (maximal gradient point)
  - Matrix progress through the events protocol; model calls via libraries; the fs/`process.cwd()` failure-log reach resolved honestly (injected location seam or documented ambient boundary).
  - Evidence: Pi live matrix rendering works; the ambient-reach resolution is written down; before/after size and `phase-stream/` glue shrinkage recorded.

- [ ] Record measurements and write the migration verdict
  - Before/after LoC and file counts for the three ports; `flow/phase-stream/` glue delta; a written verdict on migrating the remaining `NsExtensionApi` commands, including how filter-style (byte-stream) commands land. The standalone hostable-tier question is already resolved by the collapse Semantic Update.
  - Evidence: update in `updates/` with the numbers and the verdict; completion criteria checked.

## Parked

- Full `ClinkrIo` deletion (follow-up once the seven `ClinkrGroup` CLIs have a landing path).
- Migrating the remaining `NsExtensionApi` commands (scoped by the migration verdict).
- Pi subprocess execution for raw (un-overlaid) commands — the floor stays open by construction; building the spawn path is separate.
- Unified event vocabulary beyond progress (notifications/messages) and interaction kinds beyond `confirm`/`select` — fold in only when a ported command needs them (chat-seam in-direction grows YAGNI-style, per design decision 4).
- Interactive-command port (e.g. `handoff gc`) as a clinkr conversation gradient point, and Pi hosting clinkr commands through a generic conversation renderer (replacing per-capability `pi/` UI glue) — candidate follow-up scoped by the migration verdict; the three flow ports remain this Objective's validation set.
- `env` curation at any boundary — reintroduce only with a named host that actually curates.
- Cancellation seam (`AbortSignal`) — additive later if a hosted runtime needs it.
