---
edges:
  - objective: ontology-reshape
    annotation: Owns the focused capability-infrastructure ownership decisions and implementation first, then writes the resulting architecture and evidence back into ontology-reshape for its broader documentation and ontology closeout.
---

# Capability Infrastructure Reorganization

## Thesis

The infrastructure used to build ns capabilities has accumulated around historical package and folder boundaries rather than coherent ownership. The clearest symptom is `@nseng-ai/capability-kit`'s `kit` subpackage: command-host adapters, model-driven generation, checkpoint policy, Git-backed dispatch operations, Branch Memory invocation, and local-machine utilities share a miscellaneous container despite having different callers and reasons to change. Related residue in foundation and adjacent packages makes the intended seams harder to understand and preserve.

This Objective will establish a deliberate ownership map for the scoped capability infrastructure, then execute it in dependency order. It may move, extract, collapse, create, or remove packages, subpackages, exports, and internal modules where that produces coherent modules with clear interfaces. Supported behavior remains stable unless a simplification is explicitly decided and recorded. The resulting architecture and implementation evidence will be written back into the connected `ontology-reshape` Objective.

## Scope

- Inventory every current file, export, consumer, test surface, and dependency edge under `ts/packages/capability-kit/src/kit/`.
- Include adjacent foundation residue and receiving surfaces in foundation, SDK, Pi, brmem, Flow, cmux/dispatch, model or harness generation, and other packages when ownership cannot be made coherent by moving only capability-kit code.
- Decide a deliberate owner for every scoped concern using caller meaning, dependency direction, module depth, and the repository's package/subpackage conventions rather than source size or generic utility grouping.
- Reconcile the plan with active initiatives, especially `harness-session-generation` and active Flow work, before changing surfaces they may own.
- Execute the ownership map as dependency-ordered, reviewable slices; migrate imports, exports, tests, and documentation with each move.
- Remove obsolete junk-drawer structure and compatibility surfaces once consumers have migrated.
- Record the final ownership decisions, deviations discovered during implementation, and completion evidence back in `ontology-reshape` so its broader ontology and context work consumes the implemented truth.

## Non-Goals

- Redesigning user-visible product behavior merely because code changes owners.
- Preserving private source paths, internal workspace imports, or obsolete package structure for compatibility.
- Treating shared dependencies such as Git, filesystem access, or process execution as sufficient reason to group unrelated workflows into another junk drawer.
- Opportunistic cleanup of adjacent packages beyond what is needed to establish the scoped ownership model and maintain dependency direction.
- Completing all remaining ontology, glossary, or context-document work owned by `ontology-reshape`.
- Adding autonomous Runner policy; this Objective is planning- and recommendation-first unless explicitly updated later.

## Completion Criteria

Every file and exported concern that began in `capability-kit/src/kit`, plus every adjacent foundation residue concern admitted during the ownership inventory, has a documented deliberate owner. The agreed moves are landed; all live consumers and tests use the new interfaces; obsolete `kit` declarations, paths, exports, and transitional compatibility surfaces are removed; package topology and dependency guards accept the result; focused tests and relevant repository checks pass; and the implemented ownership model, material deviations, and evidence are written back into `ontology-reshape`.

## Assumptions and Risks

- **Assumption:** supported behavior can remain stable while internal ownership, package identities, and export paths change. If a coherent interface requires behavioral change, that change must become an explicit decision rather than an incidental side effect of a move.
- **Assumption:** the full consumer and export inventory can reveal enough dependency information to ratify an ownership map before implementation. Implementation findings may revise destinations, but they should not silently broaden the Objective.
- **Risk:** hidden consumers, source-path imports, release packaging, or test-only edges may make an apparently local move larger than the initial inventory suggests. Consumer and publish-surface evidence must precede deletion of old paths.
- **Risk:** moving concerns to intuitive owners may introduce dependency cycles or violate package-tier and subpackage rules. Destinations must be tested against actual dependency direction, not names alone.
- **Risk:** model-generation and Flow/checkpoint concerns overlap active Objectives and could create conflicting ownership changes. Reconcile those surfaces with the relevant active records before executing their slices.
- **Risk:** broad structural freedom can turn this into unbounded infrastructure cleanup. Admit adjacent work only when it is necessary to give a scoped concern a coherent owner or remove the obsolete structure it leaves behind.
- **Risk:** reorganizing into several shallow pass-through modules would improve filenames without improving leverage or locality. Ownership decisions must state the caller-facing interface and complexity hidden behind it.

## Open Questions

- Which current concerns are genuinely shared capability-building infrastructure, and which belong to a specific capability, host, SDK surface, or neutral-infrastructure package?
- Does model-driven generation belong to the active harness-session-generation architecture, an existing precise infrastructure door, or a newly justified owner?
- Which foundation residue is in scope because it participates in the same ownership confusion, and which should remain explicitly outside this Objective?
- Can `@nseng-ai/capability-kit` remain as a smaller coherent package, or does the ownership map remove its reason to exist?
- Which supported external exports, if any, require a deliberate migration path rather than direct removal?
