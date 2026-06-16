# Context Profiler

## Thesis

Productionize the episodic context profiler prototype as a first-class Pi extension, via a from-scratch rewrite on a branch off `master`. The prototype (`.pi/extensions/context-profiler-prototype.ts` on the `model-subagents` branch) validated the product direction — a live, interactive TUI overlay that explains where a session's context went: base regions, per-turn token accounting, LM-segmented episodes, per-episode efficiency/relevance judgments, and delegation detection. The rewrite owes the prototype fidelity of direction **and of its validated interaction design** (recorded under "UI design" in Scope) — not fidelity of code. The sibling visualizer prototypes (`context-visualizer-prototype.ts`, the sidepanel and intelligence-board branches) are not carried forward, **including as a UI reference**; their branches remain in place but are not referenced as live work.

## Scope

- **Identity**: command `/context-profiler`; implementation at `ts/packages/pi-extensions/src/context-profiler/` as a multi-file module (the `grill-ui/` pattern) with the standard 2-line shim at `.pi/extensions/context-profiler.ts`.
- **Capabilities** (in delivery order; see roadmap):
  1. Deterministic core: base-region breakdown, flat per-turn list (role, tool names, token estimate, excerpt), verbatim content drill-down, live updates from `context` events.
  2. LM episode segmentation over the turn list.
  3. Per-episode efficiency/relevance analysis (`efficient/mixed/wasteful`; `load-bearing/still-useful/stale/rot`).
  4. Delegation/subagent detection.
  5. Bundle persistence: freeze the exact provider-visible context into immutable `context-profiles/<sessionId>/<ordinal>/` bundles (`messages.jsonl`, `manifest.json`, `system-prompt.md`) when the profiler launches.
  6. Episodes export: let startup segmentation/analysis run to completion after overlay close/refresh and write terminal `episodes.json` once per bundle.
  7. Read-only bundle interrogation: an embedded `AgentSession` scoped to a persisted bundle (bundle-contract prompting, transcript/controller state), reached via `p` from overview/episode scopes in an overlay chat frame.
- **Architecture**:
  - `model.ts` holds pure derivation (entries/events → regions + turns); `view.ts`/`render.ts` hold TUI components consuming plain data; `runtime.ts` holds live-update state and event subscription glue; the top-level module wires the extension and registers the command.
  - Token counts are best-effort estimates, clearly labeled. Estimation is isolated behind one function, and provenance ("reported" vs "estimated") is carried in the data so precision can improve later without a view rewrite.
  - Episodes are optional annotations over the turn list (`{label, kind, turnRange}`), never structural. The deterministic view is complete without them; LM rows are additive.
  - LM calls go behind a gateway interface with an in-memory fake (per `typescript-fake-driven-testing`). Model responses are validated with Zod boundary schemas and repaired (clamp episode/delegation claims to real turn indices) rather than trusted.
  - Testing bar: Vitest unit tests for all derivation and render logic in `ts/packages/pi-extensions/test/context-profiler-*.test.ts`. No TUI e2e.
- **LM policy**:
  - On-demand only: segmentation/analysis fire on overlay open and manual refresh, never in the background while the overlay is closed. The profiler must not silently spend tokens or perturb the session it is profiling.
  - A fixed cheap/fast analysis model, defined as a single code-level constant and resolved through the model registry — never the session's main model.
  - Hard requirement — graceful degradation: if the analysis model is unavailable (no key, registry miss, request failure), the overlay remains fully functional deterministically with a clear "segmentation unavailable: <reason>" state. LM failure never blocks the view.
  - The fixed-cheap-model rule applies to segmentation/analysis calls. The read-only bundle interrogation chat is different: it is explicitly user-initiated per question and uses the host session's selected model, degrading with a clear reason when no model is selected.
- **UI design** (validated by the prototype on `model-subagents`; the rewrite owes fidelity to this interaction design, not to the prototype's code):
  - **Frame-stack navigation**: full-screen bordered overlay; frames form a stack — overview → base-region detail / episode list / episode detail → verbatim content. `⏎` pushes, `Esc`/`q` pops (closing from overview), `r` re-snapshots and resets to overview, `?` toggles help. Breadcrumb path in the frame title (`context profiler › <region> › <member>`); key-hint footer always pinned.
  - **Overview layout**: top usage bar (base vs. live vs. free, scaled to the context window) over two sections, `BASE` and `LIVE`, with uniform rows: `▌` selection marker · label · 14-char `█`/`░` bar scaled to the largest *visible* row · `≈`-prefixed compact token column (`42k`, `3.5k`, `1.2M`) · percent column · dense 8-char status column (outcome glyph `✓ ● ✗ ? ·` + kind abbrev `exp/edit/dbg/test/rev/chat/—` + `⇄` delegation marker).
  - **Health-based theme colors**, never hard-coded: accent = active / load-bearing / efficient, muted = completed / still-useful / mixed, warning = abandoned / errored / stale / rot, dim = unknown; selected row inverted on the selection background.
  - **Density control**: episodes under ~1/24 of live tokens coalesce into one expandable `▸ N small episodes` row; live turns capped (first 16 + last 64) with the elided middle stated in the section header; scroll note (`rows N–M of Total`) appears only when content overflows.
  - **Claim lines**: every drill-down frame opens with a one-line claim stating what the view shows and what `⏎` does; LM-derived structure is labeled as a claim (`LM claim: kind=… · outcome=… · turns N–M`).
  - **Verbatim content view**: renders message parts semantically (`⏺ <tool>` call/result headers, `[thinking]`, `[image]`), sanitizes CR/tabs, wraps ANSI-aware, and scrolls without selection.
  - **Visible-but-never-blocking LM states**: `symbolizing…` while segmenting with deterministic fallback episodes shown meanwhile; `no symbols: <reason>` on failure; per-episode `analysis: …` / `analysis failed: <message>`; verdicts rendered inline, colored by judgment; heuristic delegations marked `(inferred)`.
  - **Estimation honesty**: every estimated count carries the `≈` prefix; methodology and data provenance live in the `?`-toggled help layer, not in always-on chrome.
  - **Frozen snapshot**: the profile is captured at open and frozen; live events update data for the next `r` refresh, never the open view.
  - **Rendering discipline**: every cell truncates-then-pads to its exact column width (no jitter across renders); bar/token/percent/status widths are fixed with the label absorbing the remainder; minimum-width floors degrade narrow terminals gracefully.
- **Design principle**: diagnostic-only, non-mutating, never advisory. The profiler observes and explains; it does not recommend compaction, suggest dropping content, or mutate session state. *(Refined: "never advisory" is the hard boundary, not blandness — per-episode judgments are deliberately opinionated-descriptive: blunt, committed characterization with reasons, stopping short of recommending any action.)*
- **Delivery**: each roadmap row is implemented as its own small Graphite stack off `master` (via the `objective-stack-impl` flow), with `objective-update` recording progress between rows.

## Non-Goals

- **Advisory/actionable layer** (e.g., flagging rot episodes as compaction candidates): future objective, not a rejected direction. The relevance taxonomy already produces the raw material; deferring keeps the tool observably side-effect-free while trust in its judgments is established.
- **Headless transcript profiling** (offline CLI over session files): different product with different inputs (no `context` events, no model-registry context). `/context-profiler` carries an explicit cross-harness parity waiver as a TUI-native interactive diagnostic, recorded in the parity table per convention.
- **Visualizer directions** (sidepanel rendering, intelligence-board concept from the abandoned prototype branches): not carried forward into the production version.
- **User-facing model configurability** for the analysis model: not in initial scope (tracked as an open question).
- **Background/automatic profiling**: rejected for this objective by the on-demand LM policy.

## Completion Criteria

All seven capabilities landed on `master`: deterministic core, LM episode segmentation, per-episode analysis, delegation detection, bundle persistence, episodes export, and read-only bundle interrogation — usable through `/context-profiler` with the degradation, testing, and architecture constraints in Scope. The full vision is the closure gate; re-scoping along the way happens through Semantic Updates, not by quietly shrinking the gate. *(The four later capabilities were briefly tracked in a `## Roadmap` section here when they landed; that section moved to `roadmap.md` rows, the canonical roadmap location, and the capability list in Scope.)*

## Assumptions and Risks

Assumptions:

- The prototype on `model-subagents` is a sufficient behavioral reference; no other spec exists or is needed. *(Revised: the interaction design is now recorded durably under "UI design" in Scope, so losing the branch no longer loses the UI lessons; the branch remains the only behavioral/code reference for derivation logic until the deterministic core lands.)* *(Revised again with the deterministic core landed: the production module and its Vitest suite are now the behavioral reference for derivation logic; the prototype branch is historical and no longer load-bearing.)*
- The `@earendil-works/pi-coding-agent` Pi runtime extension API surface (`ContextEvent`, `SessionEntry`, `modelRegistry`, overlay/TUI primitives) remains the integration surface for the production extension.

Risks:

- **External API drift**: the extension depends on pi-coding-agent's event and type surface; a breaking change there breaks the profiler. Accepted — same exposure as every extension in `ts/packages/pi-extensions`.
- **LM response fragility**: segmentation, delegation, and analysis responses are model-emitted JSON. Segmentation and delegation claims are de-risked in production code by Zod boundary schemas, lenient parsing, and repair to real capped turn indices; invalid delegation entries are dropped and valid claims are capped/deduplicated. Per-episode analysis is de-risked by the same gateway failure-as-value pattern plus a Zod verdict schema for exactly the allowed efficiency/relevance pairs; invalid analysis output remains visible as a non-blocking per-episode failure.
- **Long-session payload size**: the profile is shipped as JSON to a small model; very long sessions can exceed its context or get expensive. Segmentation is de-risked by an explicit payload policy: use the deterministically capped turn list, send excerpts rather than verbatim content, and drop middle turns beyond a hard serialized-size cap while preserving first/last context. Per-episode analysis sends the full target episode from the capped snapshot with surrounding episode map/summary; this accepts residual risk for unusually large individual episodes rather than adding a second truncation policy in this row.
- **`context` event availability**: the prototype needed a `branch-fallback` live source, implying the primary event is not always present. The rewrite must define which source is authoritative when sources disagree. *(De-risked by the deterministic core: `runtime.ts` defines the rule — the `context` event is authoritative once one has been received this session; the session-branch fallback applies only before that; the snapshot carries `liveSource` provenance.)*
- **Interrogation token spend**: the embedded interrogation agent uses the host session's selected model, which may be expensive. Accepted — spend is strictly user-initiated per question (consistent with the on-demand LM policy's intent), and the session degrades visibly rather than silently when no model is selected.

## Open Questions

- Should the analysis model become user-configurable, and through what mechanism? (Deferred from the LM-policy decision; default remains a single code-level constant. Carried as a follow-up past closure; any future work belongs to a new objective.)

## Closure

Completed. All seven capabilities in the Completion Criteria are landed on `master` and usable through `/context-profiler`: deterministic core (PR #1207 stack), LM episode segmentation, per-episode efficiency/relevance analysis with opinionated summaries, delegation/subagent detection, bundle persistence under `context-profiles/<sessionId>/<ordinal>/`, terminal `episodes.json` export per bundle, and read-only bundle interrogation (embedded session core plus the `p` chat overlay) — the last four landing in the `d4d442d6c` stack with refinement/hardening follow-ups (`6fb441ea5`, `1fc88e968`) and structural refactors (`40793fbdb`, `5fb0e06b6`, `80a4bb20c`).

The architecture, degradation, and testing constraints in Scope held: pure derivation in `model.ts`, gateway-isolated LM calls with in-memory fakes, Zod-validated/repaired model output, LM failure never blocking the deterministic view, and Vitest coverage across `test/context-profiler-*.test.ts`. Closure verification: full pi-extensions Vitest suite passed.

Caveats and follow-ups: the interrogation chat intentionally uses the host session's selected model (recorded in Scope's LM policy and as an accepted risk); analysis-model user-configurability remains an open question deferred to any future objective; the advisory/actionable layer remains an explicit non-goal and candidate future objective.
