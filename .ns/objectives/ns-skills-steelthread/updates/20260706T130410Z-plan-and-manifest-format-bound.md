# Provision Plan and Install Manifest Format Bound

## Summary

The harness-artifacts steelthread now has a pure provision-planning and manifest-decision substrate. `buildProvisionPlan` accepts a catalog entry, harness, scope, path context, source-version string, and pre-hashed source-file facts; it returns a deterministic file-level copy plan for skill artifacts only, while `agent` and `extension-bundle` entries remain model-only with a typed rejection result.

The install manifest v1 shape is now bound for the thread: entries are keyed by `<harness>:<scope>:<kind>:<artifactId>`, record the resolved target root/artifact path, first-party source provenance with `version`, and per-file source/target paths plus content hashes. Hashes use the existing bare SHA-256 hex convention from the pushed-down lockfile substrate where cheap, without converging the lockfile and install-manifest formats.

Manifest-driven LBYL conflict policy is pure: callers supply target-file hash facts, and `classifyProvisionDecisions` classifies each planned file as `fresh-write`, `unchanged`, or `locally-edited-conflict` without reading the real filesystem. Previously managed files whose current hash still matches the manifest may be overwritten; unmanaged or locally edited mismatches require force.

## Objective Impact

Advances the design row's provision-plan and install-manifest slice, adding tested pure logic under `@nseng-ai/harness-artifacts` while keeping CLI wiring and real filesystem apply deferred.

## Follow-Ups

Wire the pure planner into materialization/preview and the later `ns skills` CLI surface; decide the manifest file path when the apply layer writes it.
