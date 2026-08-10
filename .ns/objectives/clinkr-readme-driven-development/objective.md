---
edges:
  - objective: foundation-readme-driven-pass
    annotation: Parent umbrella; this Subobjective owns its Clinkr gate dry-run and returns process amendments before the Foundation package pass begins.
  - objective: clinkr-output-and-interaction-model
    annotation: Supplies the minimal finite-JSON input, invocation-scoped output, and semantic-interaction contract that this rebuild's modern path and Pi host adapter must conform to.
---

# Clinkr README-Driven Development

## Thesis

Establish Clinkr's cold-audience package contract in `references/README-draft.md`, then rebuild `@nseng-ai/clinkr` and enough representative production code to vet it before promoting the draft to the canonical package README. Completion requires the minimal invocation I/O and semantic-interaction contract to be implemented, documented, and closed; it does not require repository-wide migration or deletion of compatibility APIs. The completed filesystem-oriented steelthread is evidence for the authoring contract and acceptance behavior, not production architecture to preserve.

## Scope

- Maintain the approved filesystem-first product contract for command layout, selected-only loading, schema-derived argv and stdin-JSON requests, outcomes, rendering, completion, interaction, raw execution, testing, packaging, and public entrypoints.
- Preserve implementation detail intentionally omitted from the cold-audience narrative in `references/implementation-contract-notes.md`, steelthread contract provenance in `references/steelthread-contract-changes.md`, and rebuild constraints in `references/steelthread-implementation-lessons.md`.
- Rebuild one deep `ClinkrApp` module around one command model, one recursively lazy private topology, one traversal for execution/help/schema/completion, and one owner for outcome validation and rendering. Filesystem discovery and the narrow programmatic builder adapt into that topology; Commander is fresh per-invocation materialization, not a second router.
- Compose Foundation and SDK sources without pre-dispatch, flattened-tree reconstruction, legacy lowering, permissive descriptor detection, source precedence, or compatible-group merging. Each source owns a disjoint subtree; duplicate commands, command/group collisions, and every cross-source shared group path fail with canonical-path and two-source diagnostics.
- Prove the public contract through synchronized README fixtures and a bounded production-vetting set: Brmem as one complete standalone filesystem CLI and a substantial Objectives command subtree through the embedded `ns` host. The embedded slice must use the modern command model directly rather than relying on legacy exits, rendering overrides, confirmation gates, or legacy-to-modern conversion. The observable outcomes on `colocate-brmem-commands-remove-operations` and `colocate-objectives-cli-remove-operations` remain golden evidence; their shared prototype machinery is not.
- Consume the contract settled by `clinkr-output-and-interaction-model`: finite JSON request input rather than general stdin virtualization, invocation-scoped output, semantic confirmation/selection, and explicit Pi host adaptation. Do not promote this Objective's README or close this Objective until that narrow contract is implemented, documented, and that Objective is closed.
- Deliver the bounded rebuild and vetting work in dependency order: command contracts, topology and runtime, Foundation/Brmem acceptance, SDK composition/Objectives acceptance, final output/interaction implementation and production vetting, package qualification, and README promotion. Keep compatibility surfaces for unselected callers where needed; do not require repository-wide migration or legacy deletion for this Objective.
- Return the steelthread/rebuild process lesson to `foundation-readme-driven-pass` before this Subobjective closes.

## Non-Goals

- Preserving the steelthread's implementation abstractions, commits, branch shape, or compatibility interfaces because they produced a working vertical slice.
- Reintroducing generated manifests, production filesystem codegen, duplicate dispatch/completion paths, or public prototype lifecycle machinery.
- Repository-wide caller migration, Foundation legacy `defineCli` deletion, or wholesale conversion of every domain operation to the final outcome and interaction model.
- Deletion of `ClinkrGroup`, `/legacy`, old confirmation helpers, compatibility exports, or legacy tests still needed by unselected consumers. These may move to a separate cleanup Objective and are not README-promotion gates.
- Redesigning unrelated CLI behavior or downstream domain logic.
- Changing Clinkr's package identity, release disposition, tier, or repository ownership.
- Starting the Foundation package pass or another sibling package Subobjective.

## Completion Criteria

- `references/README-draft.md` is the coherent approved cold-audience contract; all TypeScript examples compile, and its primary examples execute unchanged through the public interface for argv and stdin JSON.
- Every material steelthread refinement is represented in the README or a named supporting reference with a clear role; the README remains the user contract, implementation notes remain the acceptance checklist, and steelthread records remain provenance.
- The rebuilt package has one runtime/traversal, recursively lazy immediate-child discovery, truthful context-free/contextful types, exact descriptor decoding, topology-preserving source composition, and explicit raw/completion ownership.
- The documented modern path has one owner for routing, outcomes, rendering, completion, raw execution, and interaction translation. Compatibility owners may remain for unselected legacy consumers, but no vetted production slice lowers through them or uses a legacy-to-modern conversion.
- Package contract tests cover the requirements in `implementation-contract-notes.md`, including malformed topology, absolute-directory validation, transactional loading, bodyless and framework usage outcomes, exception propagation, `--input-json`, the exact `human | json | md` format domain, completion fallback, and progressive-output policy.
- The production-vetting set is complete: Brmem proves one complete standalone filesystem CLI and packed inventory/execution, while a substantial Objectives subtree proves recursive SDK mounting, context adaptation, malformed-neighbor isolation, nested import laziness, and direct modern outcomes through the real `ns` host.
- `clinkr-output-and-interaction-model` is closed only after its reduced finite-JSON input, higher-level invocation presentation, semantic-interaction, structured-progress, and Pi embedding contract is implemented and documented. The modern host path conforms to it end to end.
- Packed-package evidence confirms runtime-discovered command/group files ship intact, and relevant package, type, test, and repository checks pass.
- The canonical README accurately names the supported modern entrypoint; promotion does not require moving that API to the package root if `/app` remains the truthful public entrypoint. The draft is then promoted to Clinkr's canonical package README, the Objective draft becomes a provenance pointer, and reusable gate amendments are recorded in `foundation-readme-driven-pass`.

## Prompt Guidance

Use `/ns:plan:grill-and-save` only when the selected next semantic step is bounded landing work whose material decisions are settled and whose expected result is one or more PRs. When used, the proposed prompt must start with `/ns:plan:grill-and-save`, not an introductory verb such as “Run.” The prompt should name the slice, direct a fresh session to this Objective as the architecture and acceptance source, cite only the necessary roadmap/reference/golden branch, and ask for the fewest coherent PRs with deletion and validation evidence.

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
- **Compatibility confusion.** Retained legacy surfaces can make the README-driven API's support boundary ambiguous. Keep them out of the documented modern path, prevent the bounded production-vetting slices from lowering through them, and track eventual migration/deletion separately rather than making it a hidden closure gate.
- **Public-interface inflation.** Keep advanced composition focused on programmatic topology, extension mounting, custom loading, framework integration, and packaging environments that cannot preserve command directories.
- **Packaging constraints.** Runtime discovery requires intact files and directories. Verify packed artifacts rather than inventing a manifest fallback.
- **Migration breadth.** Stop after the standalone and real-host acceptance consumers for review before broad migration freezes transitional decisions.

## Open Questions

- What exact process amendment should `foundation-readme-driven-pass` adopt when a steelthread validates a README interface but falsifies the implementation architecture?
