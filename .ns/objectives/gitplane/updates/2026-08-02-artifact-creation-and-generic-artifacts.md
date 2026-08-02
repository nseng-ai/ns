# Gitplane Artifact Creation and Generic Artifact Contract Amendment

## Summary

A post-grill amendment refines the settled v1 contract before package implementation. Artifact IDs are now required canonical lowercase ULIDs rather than arbitrary consumer identities with a recommended format. Classification is optional: `gpApiVersion`, `gpKind`, and `gpSchemaVersion` form an all-or-none block, while an artifact containing only `gpId` is a first-class generic artifact.

Generic artifacts participate in discovery, checking, immutable revision history, reconciliation, transition events, moves, deletion, restoration, and control storage without kind validation or target-table projection. A generic artifact may become classified once; that content change emits `artifact.revised` and establishes immutable API/kind lineage. Classified-to-generic and API/kind changes remain invalid.

The amendment also adds local, config-free `gitplane artifact create <directory>`. It atomically creates a new directory and deterministic marker, mints a lowercase ULID by default or validates `--id`, and optionally classifies through `--kind` with explicit API/schema overrides. Existing targets and missing parents fail without mutation, and rollback removes only invocation-owned state.

## Objective Impact

The CLI contract now has four surfaces: `artifact create`, `check`, `reconcile`, and `doctor`. ID minting is confined to creation; discovery and reconciliation consume IDs already present in markers. The package-skeleton roadmap slice now includes functional local creation and the identity/gateway foundations it requires, while discovery/check, SQLite projection, reconciliation, the reference consumer, CI Action, and document promotion remain later slices.

The normative specification now fixes byte-framed recursive SHA-256 content digests, existing `gpr_` revision derivation, and byte-framed deterministic `gpe_` event derivation using lowercase unpadded Crockford Base32. Package/CLI topology includes the filesystem-first `artifact` group and `create` command.

This update semantically amends the earlier v1 contract update. The earlier update and `references/v1-contract-design-report.md` remain immutable historical records; `references/README-draft.md` and `references/SPEC-draft.md` remain the current canonical contracts.

## Follow-Ups

- Implement package scaffolding, canonical ULID parsing/generation, exact digest/revision/event identities, complete gateway contracts and fakes, and atomic local artifact creation in the current roadmap slice.
- Ensure later discovery, check, reconciliation, control storage, and event scenarios treat generic artifacts as first-class without synthetic kinds or mappings.
- Project and validate only classified artifacts; test the one-way generic-to-classified transition and rejection of reverse or changed established classification.
- Preserve the local, config-free creation boundary and keep ID minting out of discovery and reconciliation.
