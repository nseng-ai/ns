---
edges:
  - objective: flow-stack-workflows
    annotation: Sibling Flow-surface effort; that record folds the agent-driven workflow tier (including moving the restack Pi wrapper alongside its first slice) while this record owns Flow's Pi tier — stack:view promotion and namespace normalization.
  - objective: stack-repair-loop-hardening
    annotation: Coordination dependency; this record answers that record's stack-view-backend open question by promoting stack:view into Flow consuming the enriched branch-pr-checks surface built there, instead of keeping a duplicate GraphQL layer.
---

# Flow Pi tier

## Thesis

Flow's Pi surface today is the `ns:flow` namespace delegating to the CLI plus one
namespace stray (`gt:squash-stack`), while the richest stack UI in the repo —
`/stack:view` — sits in `@internal/pi-tools` as vibecoded consumer tooling whose
module header plans promotion to a standalone `@nseng-ai/stackview` capability.
The 2026-07-14 Pi-layer survey overrode that path: "see the state of my stack" is
part of Flow's everyday-loop story, and a standalone capability would straddle the
stack and review-conversation domains awkwardly. Establish **Flow's Pi tier**: the
turn-saving Pi UI over the same portable commands and workflows, with stack:view
promoted into Flow's Pi layer as a composer of sanctioned primitives (`slot gt
exec` topology, `address exec` checks/threads) — the same composition pattern
Flow already uses for slots — and the namespace stray normalized.

## Scope

- Promote stack-view out of `@internal/pi-tools` into Flow's Pi layer
  (`ts/packages/capabilities/flow/src/pi/`), registered under the `ns:flow`
  namespace. Promotion out of the internal rung means earning tests on the way —
  the module is explicitly vibecoded today — and consuming sanctioned primitives
  where they cover its needs: stack topology from `slot gt exec`, checks and
  threads from the `address exec` surface as `stack-repair-loop-hardening`
  enriches it, rather than stack-view's own hand-rolled GraphQL layer.
- Rewrite the module header's stale promotion path (standalone
  `@nseng-ai/stackview` with an `ns stack view` CLI) to reflect this record's
  decision.
- Normalize `gt:squash-stack` to `/ns:flow:squash-stack`, with a deliberate
  disposition for the old name.
- Update `definePiSurfaceParity` metadata for every moved or renamed surface.

## Non-Goals

- No standalone `@nseng-ai/stackview` capability; that documented path is
  explicitly superseded.
- Not the restack Pi wrapper (`/code:gt-restack-resolve`) move — that travels
  with `flow-stack-workflows`' first fold-in slice (edge).
- Not pr-previews: `/pr:preview-feedback` stays in the address domain, and the
  `/pr:preview-checks` deprecation is parked, contingent on this record's
  promotion and the shared enriched backend.
- No feature rewrite of stack-view's enrichment behavior beyond what testing
  seams and primitive consumption require. Compose and stack-level Summarize were
  removed by product decisions on the master-based stack-view implementation and
  are not behaviors the later Flow promotion should preserve.

## Completion Criteria

- stack:view lives in Flow's Pi layer under the `ns:flow` namespace with tests;
  `@internal/pi-tools` no longer carries it, and the stale header promotion path
  is gone.
- Its data layer consumes sanctioned primitives where they exist — no duplicated
  GraphQL for facts a primitive covers; any accepted residual duplication is
  documented, not silent.
- `gt:squash-stack` is registered as `/ns:flow:squash-stack` with the old name's
  disposition executed.
- Parity metadata reflects the moved surfaces; repo validation (`just`) green as
  completion evidence per slice.

## Assumptions and Risks

Assumptions:

- **Flow Pi tier over standalone capability.** Decided 2026-07-14: stack:view's
  organizing axis is the stack, and composing address/slot-gt primitives keeps
  the domain boundary clean. If stack:view grows genuinely non-stack scope, a
  future update should revisit rather than silently stretching Flow.
- **The checks/threads backend is `stack-repair-loop-hardening`'s enriched
  `branch-pr-checks`.** This record answers that record's stack-view open
  question with "yes, upon promotion"; the two records coordinate through the
  edge rather than duplicating a GraphQL layer into platform code.
- **Tests are the price of leaving the internal rung.** Promotion is blocked on
  test coverage by convention (`docs/conventions/platform-and-consumer.md`), not
  on any external gate.

Risks:

- **Test-earning cost is unknown.** TUI and enrichment code resist testing; seam
  extraction per the fake-driven-testing conventions may balloon
  the work. If it does, stage the promotion (data layer first, UI after) rather
  than stalling the record.
- **Backend timing.** If the enrichment work stalls, promoting stack-view with
  its own GraphQL layer intact imports the duplication into platform code.
  Prefer sequencing behind the enriched surface, or accept and document the
  duplication explicitly.
- **Renames break muscle memory.** `/stack:view` and `gt:squash-stack` are daily
  surfaces; breaking changes are allowed in this repo, but skills, prompts, and
  docs referencing the old names need the reference sweep.

## Open Questions

- Pi command name for the promoted view: `/ns:flow:view`, `/ns:flow:stack-view`,
  or keeping `/stack:view` as an alias during transition.
- Single-shot promotion or staged (data layer with tests first, TUI/overlay
  after)?
- Old-name disposition for both surfaces: aliases for a window or clean break?
