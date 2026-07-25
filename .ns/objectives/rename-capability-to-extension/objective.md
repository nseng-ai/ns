---
edges:
  - objective: professional-repo-curation
    annotation: Parent umbrella; this rename is its first primary Subobjective, and the vocabulary verdict here hard-orders before the umbrella's demotion commit so directories and names move once.
---

# Rename Capability to Extension

## Thesis

The domain term **"capability"** is renamed to **"extension"** across ns vocabulary, documentation, and CONTEXT files, with an explicit disambiguation contract that prevents confusion between *pi extensions* (the pi harness's `.pi/extensions/*` plugin mechanism) and *ns extensions* (the renamed ns packages). The verdict settles vocabulary first — cheap, docs-and-CONTEXT-first — while code-level renames (the `capability-kit` tier, identifiers, path literals) are sequenced with the parent umbrella's demotion commit so that paths and names move exactly once. The settled vocabulary also reconciles the parent's README presentation taxonomy, whose current axes ("core capabilities" vs "extensions") collide with the new term.

## Scope

- The vocabulary verdict: "extension" replaces "capability" as the canonical ns domain term. **ns extension** covers both the technical package and the feature area; use bare **extension** when context is unambiguous, and qualify **ns extension** versus **Pi extension** when either could be meant.
- The disambiguation contract, written down where agents and readers will find it: root `CONTEXT.md` (canonical term + *Avoid* entries for "capability"), relevant nested CONTEXT files, and `CONTEXT-MAP.md` if routing changes. The curated public in-process `/api` surface of one particular extension package is its **extension package API**, distinct from the `@nseng-ai/sdk` author API and Pi's runtime `ExtensionAPI`.
- Reconcile `professional-repo-curation`'s `references/root-readme-positioning.md` taxonomy without reopening its settled positioning decisions: the objectives/handoffs/flow/pr-feedback group is presented as **the core**, while slots/reviews/plans/branch-context is presented simply as **extensions**.
- Docs/prose sweep: rename "capability" in READMEs, docs/, skills prose, and Objective records where the term is domain vocabulary (not historical quotations or immutable Semantic Updates).
- Inventory the code-level blast radius — `ts/packages/capability-kit`, identifiers, config keys, path literals — and produce the rename plan that the demotion commit (or an adjacent slice) executes; this Subobjective decides, the parent sequences the code moves.

## Non-Goals

- No repo, product, or scope rename: `ns`, `@nseng-ai/*`, and the repo name are unchanged (parent decision).
- Executing the directory/package code renames is not owned here when they are cheaper done inside the demotion commit; this record owns the verdict and the plan, and executes only the vocabulary/docs layer.
- No rewriting of immutable history: existing Semantic Updates, ADR texts, and closed records keep their original wording.
- No reopening of the settled README positioning decisions beyond the taxonomy vocabulary itself.

## Completion Criteria

- The vocabulary verdict and pi/ns disambiguation contract are recorded in root `CONTEXT.md` (with "capability" in the *Avoid* list) and reflected in affected nested CONTEXT files.
- `references/root-readme-positioning.md` in the parent record is reconciled to the new taxonomy vocabulary.
- The docs/prose sweep has landed: no live domain-vocabulary use of "capability" remains outside immutable history and deliberate historical references.
- The code-level rename plan (tier directory, package name, identifiers, path literals, sequencing relative to the demotion commit) is written and handed to the parent umbrella.

## Assumptions and Risks

Assumptions:

- The rename is mostly vocabulary/docs work for this Objective's owned execution. The code blast radius is discoverable and bounded, but the narrower assumption that it was limited to the `capability-kit` tier name plus incidental identifiers/literals is disproven: `@nseng-ai/capability-kit` is a published package identity and release-metadata entry; `capability` and `capability-kit` are enforced tier values; 11 package manifests, architecture rules/report tooling, exported Flow metadata, imports, paths, tests, local Pi adapters, and the lockfile encode the old names. No user-facing `--capabilit*` CLI flag cluster was found. Evidence: `references/blast-radius-inventory.md` and `updates/2026-07-25-blast-radius-inventory.md`.
- "Extension" is the right target term despite pi already using it. The disambiguation contract (qualified forms) is assumed sufficient; disproven if real usage keeps confusing the two, in which case the verdict reopens.

Risks:

- **Ambiguity leakage.** "Extension" is already taken by Pi (`.pi/extensions/*`) and the repo works with both daily. The accepted mitigation is contextual qualification: use bare **extension** only where its referent is unambiguous, otherwise write **ns extension** or **Pi extension**. The vocabulary sweep must make that rule discoverable and reviewable.
- **Double-move churn.** Renaming `capability-kit` and path literals before or after the demotion commit independently moves paths twice. Mitigation: hard-ordering — vocabulary verdict here, code moves sequenced by the parent with the demotion commit. Partly de-risked: the parent's demotion row commits to a flat `ts/packages/incubator/` receiving the residents of `ts/packages/capabilities/`, so that role directory disappears rather than being renamed and no intermediate `extensions/` directory is ever created — the largest double-move vector is structurally gone. The `capability-kit` → `extension-kit` rename is renamed-in-place in the clean zone and still needs an explicit commit boundary, so the risk is reduced, not closed. Evidence: `updates/2026-07-25-parent-sequencing-inputs-and-package-set.md`.
- **Taxonomy drift.** Reconciling the README taxonomy could quietly reopen settled positioning decisions. Mitigation: the non-goal above; only the axis vocabulary changes.

## Open Questions

- Does the `extension-kit` directory/package rename happen inside the demotion commit or as its own adjacent commit? Its intended meaning is the shared library for extensions defined in the ns repository, not yet a general third-party extension framework. The *placement* half is now answered: the parent's demotion row does not list the kit among the packages moving into `ts/packages/incubator/`, so `extension-kit` stays clean-zone top-level and is renamed in place. The *commit-boundary* half is still open and couples to the parent's own undecided question of whether the demotion is a spawned Subobjective or executed directly.
- Which mixed live prose occurrences use ordinary English "capability" rather than the ns domain term? Historical ADRs, existing Semantic Updates, closed Objective records, dated wayfinding/research snapshots, quotations, external names, and generic ability/support meanings are deliberately kept; classify mixed sentences semantically rather than requiring a repository-wide zero-match grep.
