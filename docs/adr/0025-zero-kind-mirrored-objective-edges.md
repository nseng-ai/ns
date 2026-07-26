# ADR 0025: Kind-less Mirrored Objective Edges

## Status

Accepted

## Context

Objective relationships and blockers need to be visible from each Objective record without introducing a task database or pretending that machines understand relationship prose. Unchecked mirrored prose drifts, while single-sided storage loses local perspective.

## Decision

Objective `objective.md` files may begin with closed **Record Frontmatter** containing only:

- `blocked`: a non-empty **Blocked Sentence** whose presence means the open Objective is blocked; and
- `edges`: mirrored **Objective Edges**.

An Objective Edge is an undirected, kind-less connection identified by an unordered pair of Objective slugs. Both records list the other as `{objective, annotation}`. Each required **Edge Annotation** is written from its own record's perspective, so the two annotations need not match.

The structural linter rejects malformed frontmatter, unknown counterpart records, missing mirrors, duplicate pairs, and empty annotations or Blocked Sentences. It may warn when marker state suggests a blocked sentence deserves human re-judgment, but it does not interpret prose or automatically change state.

Mutation remains skill-owned; there is no public edge-mutation API. Deleting an Objective record requires updating its counterpart edges or recovering the record from git history.

## Consequences

- A reader can see relationship meaning locally from either endpoint.
- Machine checks make mirrored structure safe while leaving semantics in prose.
- Blocked is a substate of open, not a third lifecycle state.
- The schema cannot become a carrier for arbitrary metadata, hidden registries, or workflow control.

## Alternatives

- **Typed edge kinds or direction fields:** rejected until real automation requires machine-readable semantics; partial taxonomies would imply authority they cannot enforce.
- **Single-sided storage:** rejected because it removes local, perspective-specific meaning.
- **Unvalidated mirrored prose:** rejected because drift would remain unchecked.
- **Public mutation commands:** rejected because edge and blocker judgment belongs to Objective workflows.
