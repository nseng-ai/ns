---
edges:
  - objective: foundation-readme-driven-pass
    annotation: Parent umbrella; this Subobjective owns its Clinkr gate dry-run and returns process amendments before the Foundation package pass begins.
---

# Clinkr README-Driven Development

## Thesis

Bless Clinkr's cold-audience package contract in `references/README-draft.md`, incorporating the contract refinements and implementation lessons from the completed filesystem-oriented steelthread, then rebuild the package and representative callers cleanly against that contract before promoting it to Clinkr's canonical package README. The steelthread proved the authoring result and supplied behavior evidence; it is not the production architecture to preserve.

## Scope

- Settle and bless user-facing documentation for `@nseng-ai/clinkr`: purpose, requirements, filesystem command structure, lazy selection, schema-derived CLI surfaces, outcomes and output, nested groups, completion, interaction, raw execution, testing utilities, packaging constraints, and public entrypoints.
- Preserve the steelthread's contract changes in `references/steelthread-contract-changes.md`, its implementation findings and rebuild constraints in `references/steelthread-implementation-lessons.md`, and implementation-relevant detail intentionally edited out of the cold-audience README in `references/implementation-contract-notes.md`.
- Rebuild Clinkr as one deep `ClinkrApp` module around one command model, one recursively lazy topology, one routing traversal for execution/help/schema/completion, and one outcome-validation/rendering owner rather than cleaning compatibility machinery in place. Filesystem discovery and the narrow programmatic builder are adapters to that private topology; Commander is a fresh per-invocation materialization detail rather than a second router.
- Reconcile Foundation and SDK composition without pre-dispatch, flattened-tree reconstruction, legacy lowering, permissive descriptor duck typing, source precedence, or compatible-group merging. Sources own disjoint subtrees; duplicate command paths, command/group collisions, and every group path shared by two sources fail with canonical-path and two-source diagnostics.
- Prove the rebuilt interface first through README fixtures, then Brmem as the standalone filesystem acceptance consumer and Objectives as the SDK-mounted real-host acceptance consumer before migrating remaining callers. The package shape, command locality, structural guards, fake-driven scenarios, and observable behavior on `colocate-brmem-commands-remove-operations` and `colocate-objectives-cli-remove-operations` are golden acceptance baselines to match or exceed; their shared prototype machinery is not.
- Deliver the rebuild as a coordinated, dependency-ordered Graphite stack whose early branches establish exact command contracts, canonical topology/source composition, and the single app runtime; whose acceptance branches prove Foundation/Brmem and SDK/Objectives in that order; and whose tail migrates remaining callers, deletes the legacy architecture, qualifies packed behavior, and promotes the README. No compatibility bridge may connect the new runtime to the old one merely to make intermediate branches independently releasable.
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
- Every material contract refinement learned from the steelthread is represented in the README or preserved outside the user narrative with rationale; `implementation-contract-notes.md` is the implementation checklist for editorially removed detail, while `steelthread-contract-changes.md` remains the provenance record rather than a second user contract.
- The rebuild satisfies the constraints in `steelthread-implementation-lessons.md`: one runtime and traversal, recursive immediate-child laziness, truthful context-free/contextful types, one outcome/rendering owner, exact descriptor decoding, topology-preserving extension composition, and explicit raw/completion ownership.
- No legacy mutable runtime export, migration import, duplicated SDK pre-dispatch, per-exit rendering override, validation-disable escape hatch, or compatibility descriptor detection remains in the shipped path.
- A package-level contract suite proves every requirement in `implementation-contract-notes.md`, including malformed topology, absolute-directory validation, transactional loading, bodyless and framework usage outcomes, exception propagation, format aliases, completion fallback, and progressive-output policy; a standalone filesystem CLI and an SDK-mounted extension prove representative help, schema introspection, execution, completion, hidden groups, selected-only imports, and fake-driven context behavior.
- Brmem and Objectives each match or exceed their golden colocation branch: route-local `metadata.ts`/`command.ts` and `group.ts` structure, command-local schema/handler/outcome/rendering behavior where appropriate, exact route-inventory and eager-import guards, fake-driven scenarios, hidden `exec` behavior, and no surviving consumer-specific compatibility adapter. Brmem additionally proves packed inventory and execution; Objectives additionally proves recursive SDK mounting, context adaptation, malformed-neighbor isolation, and nested import laziness.
- Packed-package evidence confirms that every runtime-discovered command/group file ships intact, and relevant package, type, test, and repository checks pass.
- The settled draft is promoted to Clinkr's canonical package README, the Objective draft becomes a provenance pointer, and reusable gate amendments are recorded in `foundation-readme-driven-pass`.

## Prompt Guidance

Use `/ns:plan:grill-and-save` only when the selected next semantic step is itself bounded landing work: its material decisions are settled, it can proceed mostly autonomously, and one or more PRs are the expected direct result. The proposed prompt must be one short command naming the slice, directing the fresh planning session to read this Objective as its primary architecture, sequencing, and acceptance source, and citing only the roadmap row, reference, or golden consumer branch needed for that slice. Ask for the fewest coherent PRs, with relevant deletion and validation evidence.

When the selected step is a discussion, contract review, design decision, blessing gate, or otherwise requires active human steering, produce a short interactive plain-language prompt and do not construct an implementation plan. If a roadmap row mixes human-steered decisions with later implementation evidence, select and prompt the decision/steering substep first; planning may follow only after those decisions are recorded. For other work that is not clearly PR-shaped, likewise use a short plain-language prompt suited to that work. In every form, do not restate the Objective in the prompt.

This guidance shapes prompt serialization only. It does not authorize implementation or choose the next roadmap row.

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
- **Parallel routing.** SDK diagnostics, collision detection, completion, or selection may tempt a pre-router. Attach those policies to the one topology and selected path instead.
- **Compatibility creep.** Temporary legacy imports, dual outcome policies, and broad descriptors can survive migration. Each vertical slice must delete its temporary seams before the next begins.
- **Public-interface inflation.** The README now commits to public advanced builders for programmatic topology, extension mounting, custom loading, framework integration, and packaging environments that cannot preserve command directories. Keep that surface focused on those use cases and do not expose prototype lifecycle machinery merely because it exists.
- **Packaging constraints.** Runtime filesystem discovery requires intact files and directories. Verify packed artifacts; do not invent a manifest fallback during the rebuild.
- **Migration breadth.** Moving many callers too early can freeze transitional decisions. Stop after the standalone and real-host acceptance consumers until foundational seams are reviewed.

## Open Questions

The remaining Clinkr product/API questions were settled in the 2026-07-27 design grill and are recorded in `references/implementation-contract-notes.md`: a narrow scoped callback builder mounts lazy sources; sources own disjoint subtrees and all shared command/group paths fail; one explicit context mode defaults to context-free; raw filesystem modules return `defineRawCommand(...)` from `command()`; and specialized APIs remain subpath-only.

- What exact process amendment should the parent Objective adopt when a steelthread validates a README interface but falsifies the implementation architecture?
