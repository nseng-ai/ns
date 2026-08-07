# Orientation: centralize-layered-project-config

**Direction: all ns configuration access is converging on one deep, typed project-config API. A caller supplies `cwd`, environment, and active harness. The API returns effective typed values with provenance.**

Getting to: preserve project-only behavior during consolidation. Activate `ns.local.toml` or user settings only after this Objective produces an ADR that refines ADR 0056 and defines source authority and setting-family rules.

What you see now: production code uses low-level `ProjectConfigGateway` reads, direct `ns.toml` access, config-only Git root probes, and `cwd`-as-root assumptions. The effective project-config API does not exist.

Use the shared API for new config reads. Keep root discovery, source reads, Node adapter construction, and precedence inside it. Keep source-specific mutation separate.

Avoid generic TOML deep merge and early activation of later config layers.

Active slice: inventory production readers and mutators. Then define the effective-read and source-mutation interfaces before migration.
