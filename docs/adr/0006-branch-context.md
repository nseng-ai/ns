# ADR 0006: Saved Plans and Branch Context

## Status

Accepted

## Context

Agent harnesses author plans. ns adds durable plan intake and branch-scoped working context without claiming the bare plan concept or inventing a special branch type. The model must also distinguish a reusable Saved Plan, an Attached Plan on an implementation branch, standing Branch Context, and a directed Handoff.

## Decision

A **Saved Plan** is inert Markdown saved in the machine-local Local Plan Store and keyed by repository and source branch. Saving adds ns metadata and attachment readiness but does not mutate the source plan. The source branch identifies where the plan came from; it is not the future implementation branch.

**Branch Context** is standing branch-scoped context stored through Branch Memory namespace `branch-context` and distinguished from raw Branch Memory by a workflow loading contract. An **Attached Plan** is a named Markdown Branch Memory entry in that context, usually `<slug>.md`. It is one Branch Context entry, not a special branch type.

Attach and load are primitives usable on any branch. Workflows may compose them with explicit branch creation, but branch creation policy remains caller-owned; Graphite is used only when explicitly requested. Named keys support multiple entries. Exact-key loading is required when selection is ambiguous, and the legacy key `plan.md` is rejected. There are no hidden compatibility fallbacks.

The source Saved Plan remains immutable when an orchestration overlay or attachment is created; regenerable overlays belong beside it rather than rewriting it.

A Handoff is a sibling concept: a directed one-shot baton for future continuation. Branch Context is standing context for the branch.

## Consequences

- `@nseng-ai/plans` owns Saved Plan storage, evidence, and selection; `@nseng-ai/branch-context` owns attachment and loading behavior.
- Any branch may acquire Branch Context; there is no planned-branch type.
- Multiple named Markdown entries can coexist without fuzzy lookup.
- Source-plan provenance, implementation-branch context, and Handoff continuation remain separate concepts.

## Alternatives

- **Planned branch or another branded branch type:** rejected because attachment does not change the kind of branch.
- **One magic `plan.md` entry:** rejected because it prevents named multi-entry context and preserves obsolete assumptions.
- **In-place enrichment:** rejected because it mixes reviewed human intent with regenerable workflow overlay.
- **Arbitrary hidden fallback:** rejected because exact storage and selection behavior must remain inspectable.
