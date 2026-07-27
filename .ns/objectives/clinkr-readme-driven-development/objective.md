---
edges:
  - objective: foundation-readme-driven-pass
    annotation: Parent umbrella; this Subobjective owns its Clinkr gate dry-run and returns process amendments before the Foundation package pass begins.
---

# Clinkr README-Driven Development

## Thesis

Bless Clinkr's cold-audience package contract in `references/README-draft.md`, incorporating the contract refinements and implementation lessons from the completed filesystem-oriented steelthread, then rebuild the package and representative callers cleanly against that contract before promoting it to Clinkr's canonical package README. The steelthread proved the authoring result and supplied behavior evidence; it is not the production architecture to preserve.

## Scope

- Settle and bless user-facing documentation for `@nseng-ai/clinkr`: purpose, requirements, filesystem command structure, lazy selection, schema-derived CLI surfaces, outcomes and output, nested groups, completion, interaction, raw and streaming escape hatches, testing utilities, packaging constraints, and public entrypoints.
- Preserve the steelthread's contract changes in `references/steelthread-contract-changes.md` and its implementation findings and rebuild constraints in `references/steelthread-implementation-lessons.md`.
- Rebuild Clinkr around one command model, one recursively lazy topology, one routing traversal, and one validation/rendering owner rather than cleaning compatibility machinery in place.
- Reconcile Foundation and SDK composition without pre-dispatch, flattened-tree reconstruction, legacy lowering, or permissive descriptor duck typing.
- Prove the rebuilt interface first through README fixtures, then one standalone filesystem CLI and one real SDK-mounted extension before migrating remaining callers.
- Verify packaging and observable behavior, promote the blessed draft to the canonical package README, and return reusable README-driven gate lessons to `foundation-readme-driven-pass`.

## Non-Goals

- Preserving the steelthread's implementation abstractions, commits, branch shape, or compatibility interfaces merely because they produced a working vertical slice.
- Reintroducing a generated manifest, production filesystem codegen, two dispatch implementations, or a second completion/pre-selection path.
- Broad caller migration before the single-runtime Clinkr and SDK composition seams are closed.
- Redesigning unrelated CLI behavior or downstream domain logic.
- Changing Clinkr's package identity, release disposition, or repository ownership.
- Starting the Foundation package pass or another sibling package Subobjective.

## Completion Criteria

- `references/README-draft.md` is explicitly blessed as the coherent cold-audience contract; its TypeScript examples compile, and the primary examples execute unchanged through the public interface.
- Every material contract refinement learned from the steelthread is represented in the README or explicitly parked with rationale; `steelthread-contract-changes.md` remains the provenance record rather than a second user contract.
- The rebuild satisfies the constraints in `steelthread-implementation-lessons.md`: one runtime and traversal, recursive immediate-child laziness, truthful context-free/contextful types, one outcome/rendering owner, exact descriptor decoding, topology-preserving extension composition, and explicit raw/completion ownership.
- No legacy mutable runtime export, migration import, duplicated SDK pre-dispatch, per-exit rendering override, validation-disable escape hatch, or compatibility descriptor detection remains in the shipped path.
- A standalone filesystem CLI and an SDK-mounted extension prove help, schema introspection, execution, completion, hidden groups, all relevant outcome classes, selected-only imports, and fake-driven context behavior.
- Packed-package evidence confirms that every runtime-discovered command/group file ships intact, and relevant package, type, test, and repository checks pass.
- The settled draft is promoted to Clinkr's canonical package README, the Objective draft becomes a provenance pointer, and reusable gate amendments are recorded in `foundation-readme-driven-pass`.

## Assumptions and Risks

Assumptions:

- The filesystem-oriented authoring interface is the steelthread's durable result and should survive the rebuild unless README review finds a direct contradiction.
- The prototype stack is reliable evidence about workflows and failure modes but not an implementation source of truth.
- Brmem is a suitable standalone acceptance consumer, and Objectives is a suitable SDK/real-host acceptance consumer.
- Clean rebuilding above the original contract branch is cheaper and safer than preserving intertwined migration machinery.

Risks:

- **Prototype gravity.** Existing code may be copied because it already passes tests. Start from the blessed interface and use prototype code only when it directly satisfies the rebuild constraints.
- **README drift.** Contract prose can become aspirational again. Compile every TypeScript example and exercise the primary examples before broad migration.
- **Recursive eager loading.** Filesystem filtering or validation can accidentally inspect descendants. Opening a scope may touch only immediate children; exhaustive inspection must be a separate operation.
- **Parallel routing.** SDK diagnostics, precedence, completion, or selection may tempt a pre-router. Attach those policies to the one topology and selected path instead.
- **Compatibility creep.** Temporary legacy imports, dual outcome policies, and broad descriptors can survive migration. Each vertical slice must delete its temporary seams before the next begins.
- **Public-interface inflation.** Prototype builders may expose lifecycle callers do not need. Retain a public advanced composition interface only with concrete independent caller evidence.
- **Packaging constraints.** Runtime filesystem discovery requires intact files and directories. Verify packed artifacts; do not invent a manifest fallback during the rebuild.
- **Migration breadth.** Moving many callers too early can freeze transitional decisions. Stop after the standalone and real-host acceptance consumers until foundational seams are reviewed.

## Open Questions

- Are programmatic builders a justified public advanced interface, or should Foundation and SDK use a narrower package-private/programmatic topology seam?
- What exact overload or definition shape makes context-free `handler(request)` and `app.run(args)` truthful while preserving homogeneous context for contextful trees?
- Does app completion configuration install the visible shell-completion command and hidden resolver, or does Clinkr expose planning/rendering while a host owns that transport?
- What topology-preserving extension-composition interface expresses source precedence and diagnostics without flattening filesystem trees into leaf candidates?
- What single typed constructor authors a raw filesystem command while keeping raw argv/I/O/status ownership distinct from structured outcomes?
- Which lower-level utilities belong in the root entrypoint versus focused subpaths once the filesystem interface is the primary package story?
- What exact process amendment should the parent Objective adopt when a steelthread validates a README interface but falsifies the implementation architecture?
