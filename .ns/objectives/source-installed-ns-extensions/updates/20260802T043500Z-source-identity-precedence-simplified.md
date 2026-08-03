# Extension precedence simplified to source identity

## Summary

ADR 0053 supersedes ADR 0051's manifest-name identity rule with normalized declaration source identity. npm declarations identify by package name without version, local declarations by resolved absolute path, and recognized git declarations by normalized parsed source. Matching Project declarations suppress matching User declarations before descriptor loading; different sources remain independent even when their manifests share a package name.

The implementation removes post-load canonical-identity deduplication, available/reserved identity result sets, package identity retention on descriptor failures, and candidate-level package filtering. Declared descriptors return to a single-pass loader after source duplicate detection. The catalog filters matching User specs before loading and derives installed package names only from successful descriptors.

Focused descriptor and registry tests now assert that identical normalized sources dedupe or suppress without fallback, while distinct local sources sharing a manifest name both remain active and compose through command-path precedence.

## Objective Impact

User discovery and four-level catalog composition remain complete. The revised rule keeps explicit Project intent authoritative for the same source while reducing precedence machinery and avoiding trust in partially loaded manifests.
