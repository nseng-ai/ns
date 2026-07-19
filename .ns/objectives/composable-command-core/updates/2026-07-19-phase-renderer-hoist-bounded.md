# Semantic Update: phase renderer hoist is bounded to the SDK phase checklist

**Date:** 2026-07-19
**Kind:** Semantic Update

The default capability-agnostic phase checklist renderer now belongs to the SDK command host edge. It consumes the existing SDK phase declaration/events, reduces them with `createProgressPhaseStateStore()`, and renders terminal frames through clinkr's `StreamSink`. When the host progress listener is live, the edge forwards semantic events and does not also render terminal frames; this preserves Pi ownership and prevents duplicate output.

`flow cp` is the proving consumer. It declares its Flow-owned phase list, emits workflow phase events through the clinkr event sink, and invokes the checkpoint workflow directly. Its composable handler bundle no longer receives `onOutput`, and cp no longer constructs a legacy compatibility context or calls Flow's `flowStreamDeps()` / `runSettledPhaseStream()` byte bridge.

This hoist is intentionally narrow. The SDK did **not** acquire Flow phase specifications (`CP_PHASES`, submit, or land lists), matrix layout or controllers, submit/land orchestration, transcript-tail behavior, subprocess transcript policy, or Flow's legacy phase-stream lifecycle for commands not yet ported. Matrix events remain part of the pre-existing SDK event vocabulary and reducer ignore path; their presentation remains Flow-owned until a later port proves a capability-agnostic slice.

Accordingly, this update completes only the roadmap's default **phase** events→terminal renderer row. It does not complete matrix/default rendering for submit, migrate another Flow command, remove legacy `NsExtensionApi.onOutput`, or delete Flow's phase-stream subsystem.
