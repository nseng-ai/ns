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
- Existing acquisition and harness-artifact manifests contain enough evidence to compute the decided v1 status without performing reconciliation.
- The parent README's list fields are settled product behavior; this Subobjective implements that contract rather than reopening acquisition UX design.

Risks:

- Artifact-provisioning state may not yet have a clean read-model seam, creating pressure to couple a read-only command to activation internals. Prefer a small explicit query boundary over invoking prepare/apply behavior.
- Installed package metadata may be incomplete or corrupt. The command must report missing or degraded state deterministically rather than throwing away the row or repairing it implicitly.
- Local and npm declarations have different acquisition evidence; a single status vocabulary must not falsely imply local sources are copied into managed npm storage.

## Open Questions

None at creation. Implementation findings may require clarifying degraded artifact-provisioning states, but must not broaden the v1 acquisition surface without an explicit Objective update.
