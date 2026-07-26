# ADR 0025: Kind-less Mirrored Objective Edges

## Status

Accepted

## Context

Objective relationships and blockers need visibility from each Objective record, without task database, without pretending machines understand relationship prose. Unchecked mirrored prose drifts; single-sided storage loses local perspective.

## Decision

Objective `objective.md` files may begin with closed **Record Frontmatter** holding only:

- `blocked`: non-empty **Blocked Sentence**; presence means open Objective is blocked;
- `edges`: mirrored **Objective Edges**.

Objective Edge is undirected, kind-less connection identified by unordered pair of Objective slugs. Both records list other as `{objective, annotation}`. Each required **Edge Annotation** is written from its own record's perspective, so two annotations need not match.

Structural linter rejects malformed frontmatter, unknown counterpart records, missing mirrors, duplicate pairs, empty annotations or Blocked Sentences. May warn when marker state suggests blocked sentence deserves human re-judgment; does not interpret prose or change state automatically.

Mutation stays skill-owned; no public edge-mutation API. Deleting Objective record needs its counterpart edges updated, or record recovered from git history.

## Consequences

- Reader sees relationship meaning locally from either endpoint.
- Machine checks make mirrored structure safe; semantics stay in prose.
- Blocked is substate of open, not third lifecycle state.
- Schema cannot become carrier for arbitrary metadata, hidden registries, or workflow control.

## Alternatives

- **Typed edge kinds or direction fields:** rejected until real automation needs machine-readable semantics; partial taxonomies would imply authority they cannot enforce.
- **Single-sided storage:** rejected: removes local, perspective-specific meaning.
- **Unvalidated mirrored prose:** rejected: drift would stay unchecked.
- **Public mutation commands:** rejected: edge and blocker judgment belongs to Objective workflows.
