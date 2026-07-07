# ADR 0025: Zero-kind mirrored Objective Edges with prompting-owned semantics

## Status

Accepted

Decision record for the `objective-edges` Objective (`.sdl/objectives/objective-edges`), which owns implementation and rollout.

## Context

Inter-objective relationships today exist only as free prose inside `objective.md` files — mirrored sentences in two records with nothing keeping them consistent. The motivating failure is concrete: the hard dependency between `checkout-free-sdl-distribution` and `ship-objectives-to-customers` lives as two prose sentences that can silently drift, the same mirrored-prose failure mode the repo-ontology Objective flags for its parity table. Blocked state is similarly prose-only: nothing lets `sdl objective list` or `sdl objective check` see that a record is gated, or on what.

## Decision

Introduce **Record Frontmatter** — an optional YAML block at the top of `objective.md` — carrying exactly two keys, and nothing else:

```yaml
---
blocked: First external publish is gated on checkout-free distribution landing.
edges:
  - objective: checkout-free-sdl-distribution
    annotation: Consumed as a hard dependency; must land before this ships externally.
---
```

- **Objective Edges are undirected and kind-less.** An edge is a mirrored connection between two Objective records: each endpoint's frontmatter lists the other under `edges:` as `{objective: <slug>, annotation: <sentence>}`. Edge identity is the unordered slug pair, with at most one edge between two records. The schema records only that a relationship exists; direction, causality, and relationship kind live in the prose.
- **Edge Annotations are required on both sides.** Each side's annotation is a prose sentence written from that record's perspective. The two annotations are deliberately different texts — perspective is the payload, so a shared string would lose exactly the information the edge exists to carry.
- **Blocked Sentence: presence is the state.** `blocked:` is a prose-valued key; its presence means the record is blocked (for any reason — another objective, an external gate) and its value says why. There is no boolean, and blocked is a sub-state of open, not a lifecycle state of its own. It is set and cleared only by skill judgment, never by machine auto-flip.
- **The linter is structural only.** `sdl objective check` gains an edge/blocked linter that reports every structural violation as an error: dangling slug, missing mirror side, empty or missing annotation, duplicate pair entry, malformed frontmatter, empty blocked sentence. It sweeps all records with frontmatter-only parsing (no full-body reads), resolves slugs across both the active and archive roots (archiving an endpoint does not break an edge), and runs in CI via `just`. It never interprets annotations or derives blocked state.
- **Mutation is skill-owned.** There is no public CLI mutation surface. The objective-create, objective-update, and objective-close skills own writing edges and judging the Blocked Sentence: close flows re-judge edge counterparts' blocked state ("you are closing the thing their annotation says gates them"); update flows re-judge the record's own sentence. Hidden `sdl objective exec` helpers are permitted where a skill needs a deterministic assist.

The design philosophy is "edges with annotations, ontology stays in prose": the formal layer records only graph structure, prompting writes and interprets the semantics, and a cheap repo-wide linter enforces structural integrity.

## Considered options

- **Typed edge taxonomy** (blocking, parent, decision-ownership, subsumption, …) — rejected for v1. A kind vocabulary would be inconsistently populated across hand-edited records, and any check or rendering logic keyed on a kind would silently miss edges whose authors skipped or mistyped it — a machine layer that pretends to more semantics than it can enforce. If real automation later needs machine-distinguishable edge meaning, that is a new decision, informed by the corpus of real annotations that will exist by then. Not even an optional `kind` field ships now, because an optional field invites exactly the partially-populated taxonomy this rejects.
- **Formal `to:`/`from:` directionality** — considered and deliberately walked back. Role keys add schema surface with no machine consumer: nothing in the linter, list rendering, or skills would act on direction. The per-side annotations already state direction and causality in prose, from each record's own perspective, which is richer than a role label.
- **Single-sided storage** (store each edge on one endpoint; derive the other side) — rejected. A record's `objective.md` should be self-describing: an agent reading one record must see its edges and their annotations locally, without a repo-wide scan or a derived index, and per-side annotations need a home on each side regardless. Single-source storage was the obvious cure for drift, but it cures it at the cost of locality — and drift has a cheaper cure below.

## Why mirrored storage is safe here

Mirrored prose failed because nothing checked the mirror — consistency rested on authorial discipline across two files. Mirrored frontmatter does not share that fate: the linter enforces symmetry as a CI-blocking error, so a missing or dangling mirror side cannot land. The drift risk that killed prose mirroring is cured by machine-checked invariants, not by single-source storage — which is why this design can take mirroring's locality benefits without inheriting its failure mode. The invariant is cheap to check (frontmatter-only parsing over the record roots), and cheapness is load-bearing: an expensive sweep would get skipped, and a skipped sweep is no invariant at all.

## Consequences

- Every reader of `objective.md` — check heading lints, `read-objective`, `list`, `load-orientations`, and the Objective skill family — must strip or parse Record Frontmatter and behave identically for records with and without it.
- The linter verifies structure, not prose quality or freshness. Perspective-correct annotations and timely Blocked Sentence updates are prompting-owned at the skill touchpoints; in particular, a stale blocked sentence for an external (non-edge) blocker has no machine catch. *(Amended 2026-07-07: for edge-named gates there is now a machine nudge — `check` emits a non-failing warning when a blocked record has a closed edge counterpart, from marker state only. Disposition remains skill judgment; external, non-edge blockers still have no machine catch.)*
- The frontmatter schema is closed: no keys beyond `blocked` and `edges`, and no registries, UUIDs, or hidden attachment metadata riding along.
- `sdl objective list` can now render machine-derived edge counts and a blocked status indicator; blocked renders as a sub-state of open, not a new lifecycle state.
- Closed records' historical relationship prose (consolidation, subsumption, umbrella history) is never backfilled into live edges.

## Open questions

Deliberately left open here; the implementing Objective resolves them with recorded defaults:

- The exact CLI spelling of the repo-wide sweep (`sdl objective check --all`, default no-slug behavior, or a hidden `exec` helper for CI).
- The glyph and styling of the blocked STATUS indicator in `sdl objective list`.
