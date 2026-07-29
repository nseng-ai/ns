---
owner: schrockn
edges:
  - objective: schrockn/foundation-readme-driven-pass
    annotation: Parent umbrella; this Subobjective owns its Clinkr gate dry-run and returns process amendments before the Foundation package pass begins.
---

# Clinkr README-Driven Development

## Thesis

Establish Clinkr's cold-audience package contract in `references/README-draft.md`, then rebuild `@nseng-ai/clinkr` and representative callers cleanly against it before promoting the draft to the canonical package README. The completed filesystem-oriented steelthread is evidence for the authoring contract and acceptance behavior, not production architecture to preserve.

## Scope

- Maintain the approved filesystem-first product contract for command layout, selected-only loading, schema-derived argv and stdin-JSON requests, outcomes, rendering, completion, interaction, raw execution, testing, packaging, and public entrypoints.
- Preserve implementation detail intentionally omitted from the cold-audience narrative in `references/implementation-contract-notes.md`, steelthread contract provenance in `references/steelthread-contract-changes.md`, and rebuild constraints in `references/steelthread-implementation-lessons.md`.
- Rebuild one deep `ClinkrApp` module around one command model, one recursively lazy private topology, one traversal for execution/help/schema/completion, and one owner for outcome validation and rendering. Filesystem discovery and the narrow programmatic builder adapt into that topology; Commander is fresh per-invocation materialization, not a second router.
- Compose Foundation and SDK sources without pre-dispatch, flattened-tree reconstruction, legacy lowering, permissive descriptor detection, source precedence, or compatible-group merging. Each source owns a disjoint subtree; duplicate commands, command/group collisions, and every cross-source shared group path fail with canonical-path and two-source diagnostics.
- Prove the public contract through synchronized README fixtures, then use Brmem as the standalone filesystem acceptance consumer and Objectives as the SDK-mounted real-host acceptance consumer before broad caller migration. The observable outcomes on `colocate-brmem-commands-remove-operations` and `colocate-objectives-cli-remove-operations` are golden evidence; their shared prototype machinery is not.
- Deliver the rebuild as a dependency-ordered Graphite stack: command contracts, topology and runtime, Foundation/Brmem acceptance, SDK composition/Objectives acceptance, remaining callers, legacy deletion, package qualification, and README promotion. Do not add a compatibility bridge merely to make intermediate branches independently releasable.
- Return the steelthread/rebuild process lesson to `foundation-readme-driven-pass` before this Subobjective closes.

## Non-Goals

- Preserving the steelthread's implementation abstractions, commits, branch shape, or compatibility interfaces because they produced a working vertical slice.
- Reintroducing generated manifests, production filesystem codegen, duplicate dispatch/completion paths, or public prototype lifecycle machinery.
- Broad caller migration before the single-runtime and SDK-composition seams are established.
- Redesigning unrelated CLI behavior or downstream domain logic.
- Changing Clinkr's package identity, release disposition, tier, or repository ownership.
- Starting the Foundation package pass or another sibling package Subobjective.

## Completion Criteria

- `references/README-draft.md` is the coherent approved cold-audience contract; all TypeScript examples compile, and its primary examples execute unchanged through the public interface for argv and stdin JSON.
- Every material steelthread refinement is represented in the README or a named supporting reference with a clear role; the README remains the user contract, implementation notes remain the acceptance checklist, and steelthread records remain provenance.
- The rebuilt package has one runtime/traversal, recursively lazy immediate-child discovery, truthful context-free/contextful types, exact descriptor decoding, topology-preserving source composition, and explicit raw/completion ownership.
- No legacy mutable runtime export, migration import, SDK pre-dispatch, per-exit rendering override, validation escape hatch, compatibility descriptor detection, or other transitional owner remains in the shipped path.
- Package contract tests cover the requirements in `implementation-contract-notes.md`, including malformed topology, absolute-directory validation, transactional loading, bodyless and framework usage outcomes, exception propagation, `--input-json`, the exact `human | json | md` format domain, completion fallback, and progressive-output policy.
- Brmem and Objectives match or exceed their golden branch structure and behavior without consumer-specific compatibility adapters. Brmem additionally proves packed inventory/execution; Objectives additionally proves recursive SDK mounting, context adaptation, malformed-neighbor isolation, and nested import laziness.
- Packed-package evidence confirms runtime-discovered command/group files ship intact, and relevant package, type, test, and repository checks pass.
- The draft is promoted to Clinkr's canonical package README, the Objective draft becomes a provenance pointer, and reusable gate amendments are recorded in `foundation-readme-driven-pass`.

## Prompt Guidance

Use `/ns:plan:grill-and-save` only when the selected next semantic step is bounded landing work whose material decisions are settled and whose expected result is one or more PRs. The prompt should name the slice, direct a fresh session to this Objective as the architecture and acceptance source, cite only the necessary roadmap/reference/golden branch, and ask for the fewest coherent PRs with deletion and validation evidence.

For discussion, contract review, design, blessing gates, or other human-steered work, produce a short interactive prompt instead. When a roadmap row mixes a decision with later implementation, select the decision first and plan implementation only after the decision is recorded. This guidance shapes prompt serialization; it grants no execution authority and does not select the next row.

## Assumptions and Risks

Assumptions:

- Filesystem-first authoring is the steelthread's durable product result unless implementation evidence reveals a direct contradiction.
- The steelthread is reliable workflow and failure-mode evidence but not a source architecture to copy.
- Brmem and Objectives remain suitable standalone and real-host acceptance consumers.
- A clean rebuild above the contract branch is safer than preserving intertwined migration machinery.

Risks:

- **Prototype gravity.** Passing prototype code may be copied despite violating the rebuild constraints. Port behavior evidence selectively and keep the final ownership model explicit.
- **README drift.** The draft can become aspirational or internally contradictory. Keep examples synchronized and verify them as the implementation stack advances.
- **Recursive eager loading.** Opening a scope must inspect only immediate children; exhaustive inspection is a separate operation.
- **Parallel routing.** SDK diagnostics, completion, and selection must attach to the one topology and traversal rather than introducing a pre-router.
- **Compatibility creep.** Temporary imports, dual outcome policies, and broad descriptors can survive migration. Track and delete every temporary seam before advancing.
- **Public-interface inflation.** Keep advanced composition focused on programmatic topology, extension mounting, custom loading, framework integration, and packaging environments that cannot preserve command directories.
- **Packaging constraints.** Runtime discovery requires intact files and directories. Verify packed artifacts rather than inventing a manifest fallback.
- **Migration breadth.** Stop after the standalone and real-host acceptance consumers for review before broad migration freezes transitional decisions.

## Open Questions

- What exact process amendment should `foundation-readme-driven-pass` adopt when a steelthread validates a README interface but falsifies the implementation architecture?
