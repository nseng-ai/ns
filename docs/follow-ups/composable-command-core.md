# Follow-up: Composable command core — design conclusions and port evidence

**Point in time:** 2026-07-21\
**Origin:** the `composable-command-core` Objective and its five-PR Graphite stack (`replace-extension-api-with-invocation-context` #3782 → `composable-cp-command-api-steel-thread` #3783 → `context-free-clinkr-completions-phase-renderer` #3787 → `port-flow-changes-composable-command-core` #3793 → `descriptor-owned-ns-command-routing` #3798), closed unmerged on 2026-07-21. The Objective record — including `references/proposal-catalog-and-combinators.md` (the primitive-by-primitive evidence chain), `references/context-primitives.md`, and `references/slack-host-pressure-test.md` — existed only on those branches and was never on `master`. This note is the surviving capture.\
**Status at capture:** deliberately deferred, not rejected — a substantially bottoms-up reorganization and audit of the command/capability layer was planned, and landing a half-migrated second command system ahead of it was judged worse than re-deriving the code from the preserved design. Roadmap stood at 5 of 8 rows complete with recorded evidence; ~3,385 insertions / 801 deletions across 98 files at the tip.

## The idea

Rebuild the SDK command-definition stack around honest ownership, replacing the rich per-invocation context ("invocation context") design. A primitive-by-primitive value investigation concluded the rich context was solving a problem the system does not have: every context primitive's justification reduced to in-process hosting or in-memory testing; the real Pi host boundary is seven wire-shaped fields; `textGenerator` is already a library; clinkr already owns the presentation seam; and context-isolation discipline is unenforceable (the flagship `flow submit` reaches for `node:fs` and `process.cwd()` because a context cannot model the whole OS).

The replacement doctrine:

- **ns owns the catalog.** The only ns-dynamic contract is `NsContext = { catalog }` — one field, the one thing only ns can answer.
- **Presentation and hostability are additive combinators** (`hostable(...)`, `clinkr(...)`) over one `defineCommand`, not parallel definer surfaces; the catalog reads capability metadata off brands; hosts route mechanically (declared-hostable → in-process, otherwise → spawn, always safe).
- **Services are libraries.** Model access, model policy, exec, git — ordinary imports with constructor DI at their own seams, never context fields.
- **Semantic events over byte streams.** The event vocabulary and reducer live in the SDK (host-boundary protocol); the SDK ships the default events→terminal renderer; clinkr stays generic frame mechanics and stops abstracting stdout/stderr.
- **Validation by porting real Flow commands** (`changes` → `pull-trunk` → `submit` gradient) with before/after measurement and a written migration verdict — not by design documents.

## Settled design decisions (changing one reopens the analysis)

1. **Virtualize only what varies:** `cwd` yes (Pi's own extension context reached the same conclusion), `env` no; commands and libraries read `process.env` at the edge, tests inject env at library seams.
2. **No field without a named current consumer.** Author-facing clinkr bundle: `{ cwd, caps, events, confirm?, format? }`, each field traced to a consumer.
3. **No byte sinks in author hands.** Output is the typed result plus events; `ClinkrIo` retreats to internal plumbing, targeted for eventual deletion; new code takes no `ClinkrIo` dependency as a pressure test.
4. **`hostable` is a chat seam, not a byte pipe** (sharpened 2026-07-19): semantic events out, structured interactions in; contract `{ cwd, events, interact }` with `interact` starting at exactly `confirm` and `select`, grown YAGNI-style per named consumer. clinkr and the Pi runtime are two renderers of the same conversation; `clinkr(spec)` returning a hostable run is a return type, not doctrine.
5. **The subprocess floor:** un-overlaid (raw) commands are normal programs (`process.cwd()`, `console.log`, own argv), always real processes; hostability is declared reviewable metadata, not vigilance.
6. **Event vocabulary lives in the SDK, not clinkr.** clinkr's genericity is its value; an event vocabulary is opinionated workflow semantics owned by the SDK.
7. **capability-kit owns the first-party house context** (bundle + model policy + gateways, typed test overrides), per the platform/consumer convention.
8. **Naming (2026-07-19):** combinator is `clinkr(...)` — honest implementation naming; exports `defineCommand`, `hostable`, `clinkr` under plain names from a new SDK subpath `@nseng-ai/sdk/command`, leaving the legacy main-surface `defineCommand` untouched; legacy name takeover deferred to full-migration time.

Later evolution recorded in-stack (design collapses, both with rationale in the roadmap):

- The standalone **hostable command tier was collapsed** to a raw-or-clinkr execution model (#3787).
- **Runtime command branding and host-side materialization were removed** in favor of descriptor-owned routing: extension-catalog descriptors declare `kind: "ns-command" | "raw-command"` before lazy loading; loaded modules are validated against their declared kind; `defineCommand` returns one flat `NsCommandDefinition` with omitted input schemas defaulting to `z.strictObject({})` at the single registration boundary (#3798). The ns command bundle settled as `{ cwd, caps, events, interact, ns, format? }`.

## What was built and evidenced (closed unmerged)

Five of eight roadmap rows completed with recorded evidence:

- **`flow cp` steel thread** (#3783): composable API through the ns CLI in-process route, per-command-folder exemplar, capability-kit `FirstPartyCommandContext`; SDK/Flow/CLI/integration tests.
- **No-`ClinkrIo` pressure test** held across all new code; touched renderers refactored toward purity (return strings/frames, thin process-write edge).
- **Descriptor-owned ns command API** (#3798): discriminated `ns-command`/`raw-command` routing surviving lazy loading, variant-specific load validation, flat definition inference, strict empty-schema defaulting.
- **Phase events→terminal renderer hoisted into the SDK** (#3787): built on `ProgressPhaseStateStore` + clinkr `StreamSink`; TTY/non-TTY/failure/live-forwarding covered without duplicate output; deliberately phase-only (Flow retained `CP_PHASES`, matrix rendering, submit/land orchestration, and its legacy phase-stream driver for unported commands).
- **`flow changes` port** (#3793): lazy command factory + dependency-bound implementation module; explicit Git/model-policy/text-generation seams; three SDK phases; model work skipped for clean worktrees. Ported commands fully cut over — legacy `cp.ts` and `changes.ts` were deleted, not shadowed.

**Never done:** the `pull-trunk` port (mid-weight), the `submit` port (maximal stress point — matrix progress through events, resolving the ambient fs/`process.cwd()` reach honestly), and the before/after measurements plus written migration verdict. The design is therefore **not fully validated**: `submit` was the test most likely to force rework.

## Lessons learned

- **Partial-migration states can be built to be safe:** additive subpath, legacy surface untouched, ported commands deleting their legacy versions, and a machine-readable routing boundary (`kind` descriptors) made the half-state legible rather than mysterious. This shape is worth repeating.
- **The investigation is the asset; code is regenerable.** ~2,600 net LoC for two ported commands was cheap relative to the primitive-by-primitive analysis that produced the doctrine. Preserve conclusions durably (on `master`) before or instead of preserving branches.
- **Branch-only Objectives are a systemic failure mode.** This was the fourth stack found in one review session whose Objective record existed only in-branch; abandonment silently destroys the design record. Land planning/Objective slices early, or capture before teardown.
- **Recorded design collapses beat silent thrash.** #3787 and #3798 each removed an earlier abstraction with roadmap rationale — contrast with probe-iteration stacks where the supersession is only visible by diffing PRs.
- **A stalled second system is worse than none.** The explicit reason for deferral: landing this ahead of a bottoms-up reorg risks freezing a two-command second system with no migration verdict.

## Reverify before acting

- The closed PR diffs (#3782, #3783, #3787, #3793, #3798) remain recoverable on GitHub after branch deletion; #3782 carries the full Objective including the three reference documents.
- Whether the bottoms-up reorganization/audit has since landed and what it decided about command definition, clinkr, `ClinkrIo`, and the extension catalog — its conclusions supersede this note where they conflict.
- The status of `capability-infrastructure-reorg` (#3782 closed it as superseded; that closure never landed, so on `master` it may still appear open) and overlaps with `capability-kit-promotions`, `flow-capability-layer-cleanup`, and `ts-clinkr-commander`.
- Current `flow submit` structure — the ambient fs/`process.cwd()` reach was the outstanding honesty test for the design.

## Promotion trigger

Recreate the Objective (seeded from this note plus PR #3782's diff) when the bottoms-up reorganization plans the command-definition layer. The reorg should treat the eight settled decisions and the two recorded collapses as prior art to confirm or explicitly overturn — not re-derive from scratch — and should reuse the gradient-port validation method (`changes` → `pull-trunk` → `submit`) with `submit` as the acceptance test.
