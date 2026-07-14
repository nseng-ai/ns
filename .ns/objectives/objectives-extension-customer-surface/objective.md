---
edges:
  - objective: ship-objectives-to-customers
    annotation: Subobjective of the customer-Objectives umbrella; owns completion of the v1 Objectives extension command surface before release.
  - objective: objectives-claude-onboarding-steelthread
    annotation: Provides the completed v1 extension inspection surface consumed by the Claude Code customer onboarding thread.
---

# Objectives Extension Customer Surface

## Thesis

Complete the remaining local implementation work in the customer-facing `ns extension` surface so the Objectives release path has a stable, inspectable v1 command contract. The decided install, uninstall, and single-target update flows have landed; this Subobjective owns the missing read-only `ns extension list` command and removal of stale references to the retired top-level extension-update surface.

The command contract is already defined by the parent Objective's `references/README-draft.md`: list one row per declared source spec, report source kind, resolved package name and version, installed-versus-missing state, and artifact-provisioning state, with `--format json` as the canonical agent inspection shape.

## Scope

- Implement `ns extension list` end to end through the existing ns-init capability and host command catalog.
- Derive status from declared project configuration and existing managed-extension and artifact-provisioning evidence without mutating, acquiring, or reconciling project state.
- Preserve the standard ns machine contract, including canonical JSON output and schema support.
- Remove stale `ns update --extensions` guidance from the kernel extension-authoring documentation and harness-artifact reconciliation error text.
- Add focused operation, command, and documentation evidence for the completed surface.

## Non-Goals

- Publishing or republishing any npm package.
- Running the checkout-free foreign-repo acquisition smoke.
- Rewriting customer onboarding documentation or verifying Claude Code onboarding.
- Adding `update --all`, user/global extension scope, bare npm-name sugar, remote source kinds beyond the existing v1 contract, or self-update behavior.
- Changing install, uninstall, or update semantics except where a proven shared read-model defect requires a narrowly compatible correction.

## Completion Criteria

- `ns extension list` reports exactly one deterministic row per declared extension spec with the v1 status fields defined in the parent README contract.
- Human and canonical JSON output distinguish installed and missing acquisitions and expose artifact-provisioning state without changing project state.
- The command participates in the normal ns command catalog and machine-contract surfaces, including schema support.
- Focused tests cover empty configuration, npm and local declarations, missing acquisition state, provisioning state, and malformed project configuration at the appropriate boundaries.
- No live documentation or user-facing error text directs customers to retired `ns update --extensions` behavior.

## Assumptions and Risks

Assumptions:

- `ns.toml` extension declarations remain the source of truth for list cardinality and source-spec identity.
- Confirmed: existing descriptor, manifest, and artifact-preparation facts are sufficient for the v1 read model without acquisition or apply. When inspection is incomplete, `unavailable` explicitly makes observed counts non-comprehensive.
- The parent README's list fields remain settled product behavior; this Subobjective implemented that contract without reopening acquisition UX design.

Risks:

- De-risked: artifact status now crosses a dedicated read-only Consumer Gateway. The real adapter may reuse deterministic preparation internally, but exposes no apply operation to list callers.
- Mitigated: missing, corrupt, unsupported, duplicate, identity-mismatched, and otherwise unloadable packages remain declaration rows with structured diagnostics rather than aborting or repairing the inventory.
- Mitigated: local and npm declarations retain distinct source kinds and resolved module facts; listing does not imply that local sources are copied into managed npm storage.

## Open Questions

None at creation. Implementation findings may require clarifying degraded artifact-provisioning states, but must not broaden the v1 acquisition surface without an explicit Objective update.

## Closure

Completed the v1 Objectives extension customer surface, including a deterministic, read-only `ns extension list` row for every declared source with distinct acquisition and artifact states and canonical structured diagnostics. `unavailable` artifact counts remain explicitly observed and potentially incomplete. Detailed implementation evidence stays in the 2026-07-12 Semantic Update, and the umbrella synthesis records the downstream contract; fleet update, broader source and settings scope, and self-update behavior remain parked expansion.
