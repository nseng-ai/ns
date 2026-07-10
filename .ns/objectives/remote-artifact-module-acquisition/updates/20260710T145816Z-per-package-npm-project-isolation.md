# Per-package npm project isolation supersedes shared-project storage

## Summary

The 2026-07-07 shared npm-project decision is superseded for npm acquisition. Each canonical npm package identity now owns a private project rooted at `.ns/managed-extensions/npm/<package-name>/`; its installed top-level extension is at that leaf's `node_modules/<package-name>`. Scoped names retain their canonical hierarchy, so `@acme/tools` owns `.ns/managed-extensions/npm/@acme/tools/`.

This isolation prevents acquiring or refreshing package B from allowing npm to rewrite package A's installed bytes. npm still owns each declared extension's runtime dependencies inside that extension's private project. Pinned/floating behavior, no-lockfile operation, install-script suppression, peer suppression, per-extension diagnostics, and one declared spec to one top-level extension remain unchanged.

This is a clean break. The legacy shared `.ns/managed-extensions/npm/node_modules/` tree is neither discovered nor migrated, and acquisition does not delete its bytes.

## Objective Impact

- Supersedes the shared managed-project layout recorded in `20260707T184938Z-managed-extensions-storage-and-model-decision.md` and refined in `20260707T190752Z-pi-aligned-fetch-mechanics-and-dependency-behavior.md`.
- Narrows the storage-risk surface: npm operations for one canonical package identity no longer share a project or dependency tree with another identity.
- Keeps the Objective's package-manager boundary intact: ns maps declared top-level identities to private projects, while npm resolves runtime dependencies within each project.

## Follow-Ups

- No migration, pruning, update, or uninstall behavior is introduced. Legacy shared-project bytes remain ignored until a separately decided cleanup surface exists.
- The remaining real-remote end-to-end evidence and self-update roadmap rows are unchanged.
