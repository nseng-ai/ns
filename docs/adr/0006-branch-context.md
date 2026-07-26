# ADR 0006: Saved Plans and Branch Context

## Status

Accepted

## Context

Agent harnesses author plans. ns adds durable plan intake plus branch-scoped working context, without claiming bare plan concept or inventing special branch type. Model must also distinguish reusable Saved Plan, Attached Plan on implementation branch, standing Branch Context, directed Handoff.

## Decision

**Saved Plan**: inert Markdown saved in machine-local Local Plan Store, keyed by repository and source branch. Saving adds ns metadata plus attachment readiness; does not mutate source plan. Source branch identifies where plan came from; not future implementation branch.

**Branch Context**: standing branch-scoped context stored through Branch Memory namespace `branch-context`, distinguished from raw Branch Memory by workflow loading contract. **Attached Plan**: named Markdown Branch Memory entry in that context, usually `<slug>.md`. One Branch Context entry, not special branch type.

Attach and load are primitives usable on any branch. Workflows may compose them with explicit branch creation; branch creation policy stays caller-owned. Graphite used only when explicitly requested. Named keys support multiple entries. Exact-key loading required when selection ambiguous. Legacy key `plan.md` rejected. No hidden compatibility fallbacks.

Source Saved Plan stays immutable when orchestration overlay or attachment created; regenerable overlays belong beside it, not rewriting it.

Handoff: sibling concept, directed one-shot baton for future continuation. Branch Context: standing context for branch.

## Consequences

- `@nseng-ai/plans` owns Saved Plan storage, evidence, selection; `@nseng-ai/branch-context` owns attachment and loading behavior.
- Any branch may acquire Branch Context; no planned-branch type.
- Multiple named Markdown entries coexist without fuzzy lookup.
- Source-plan provenance, implementation-branch context, Handoff continuation stay separate concepts.

## Alternatives

- **Planned branch or another branded branch type:** rejected because attachment does not change branch kind.
- **One magic `plan.md` entry:** rejected because it prevents named multi-entry context; preserves obsolete assumptions.
- **In-place enrichment:** rejected because it mixes reviewed human intent with regenerable workflow overlay.
- **Arbitrary hidden fallback:** rejected because exact storage and selection behavior must stay inspectable.
