# Orientation: centralize-layered-project-config

**Direction: all ns configuration access is converging on one deep, typed project-config API. A caller supplies invocation `cwd`, environment, command execution channel, and optional cancellation. The API returns effective typed values with provenance. Caller identity is not configuration scope under ADR 0058.**

Getting to: preserve project-only behavior during consolidation. Activate `ns.local.toml` or user settings only after this Objective produces an ADR that refines ADR 0056 and defines source authority and setting-family rules.

What you see now: `EffectiveProjectConfig.get(setting)` exists as an invocation-bound SDK capability, and every production `[models]` reader uses it. Other setting families, points/catalogs, and mutations still contain low-level `ProjectConfigGateway` reads, direct `ns.toml` access, or root assumptions pending later slices.

Use the shared API for new config reads. Keep root discovery, source reads, Node adapter construction, and precedence inside it. Create one capability per invocation; long-lived Pi registrations retain only a factory. Keep source-specific mutation separate.

Avoid generic TOML deep merge and early activation of later config layers.

Active slice: continue setting-family migration beyond the completed `[models]` steel thread, then centralize source mutation and add enforcement.
