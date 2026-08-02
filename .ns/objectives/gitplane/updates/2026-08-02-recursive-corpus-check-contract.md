# Gitplane Recursive Corpus Check Contract Amendment

## Summary

The v1 contract now defines `gitplane check` as a corpus-only, stateless working-tree operation. One configuration selects exactly one `source.id` and one `source.artifactRoot`; `source` is the minimum valid config, while `kinds` and `store` are independently optional. Check never invokes storage or consults Git history. Generic artifacts need no registry; classified artifacts must name an exact registered API-version/kind pair and a schema version declared by that registration.

Custom artifact validation has been removed from the contract. Kind registrations no longer require `schemaVersions[].validate`, and the `ArtifactValidator` and `ClassifiedArtifactSnapshot` surfaces and validator-produced findings are removed. Schema-version projection fields, clear-fields, and directed transition metadata remain for reconciliation, where lineage and transition legality are evaluated later.

## Objective Impact

Working-tree discovery never follows symlinks. The reserved `gitplane-artifact.json` name establishes an attempted boundary regardless of entry kind, JSON validity, or envelope validity. Discovery finds all nesting first; any nested occurrences return only the complete set of `nested-artifact` findings without reading marker or artifact contents. Empty roots are valid. Ordinary special entries outside boundaries are ignored, while symlinks and special entries beneath an outer boundary—and non-regular reserved marker entries even outside one—produce `unsupported-artifact-entry`.

Completed checks aggregate the fixed finding vocabulary: `nested-artifact`, `invalid-marker-json`, `invalid-marker-envelope`, `invalid-artifact-id`, `duplicate-artifact-id`, `unknown-artifact-kind`, `unknown-schema-version`, and `unsupported-artifact-entry`. Duplicate findings are symmetric and carry complete sorted paths. Output deterministically reports source ID, normalized logical artifact root, outer attempted-boundary count, severity counts, and sorted findings. Clean and warning-only completions exit `0`; completed error findings exit `1`; operational, configuration, and source failures exit `2` without partial corpus data.

Invocation coordinates are explicit: capture the current working directory, resolve the default config there and `--config` against it, resolve the artifact root against the config directory, require it to remain within the invocation directory and be a real directory by `lstat`, then normalize it back to a current-working-directory-relative `/`-separated logical path.

This update semantically amends the earlier v1 contract updates. Those updates and the design report remain immutable historical records; `references/README-draft.md` and `references/SPEC-draft.md` remain the current canonical contracts.

## Follow-Ups

- Implement the recursive discovery and corpus-check slice against the normative finding table and all-or-nothing discovery phases.
- Remove validator surfaces from implementation and configuration while retaining schema projection and transition metadata for reconciliation.
- Keep store/history access, projection behavior, and lineage/transition legality outside `check`.
