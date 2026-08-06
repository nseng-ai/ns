# Orientation: centralize-layered-project-config

**Direction: all ns configuration access is converging behind one deep, typed project-config seam — callers supply invocation scope (cwd, environment, active harness) and consume effective typed values; they never discover roots, read `ns.toml`, bind Node adapters, or implement precedence.**

Getting to: consolidate the current project-only behavior first, behavior-preservingly; later configuration layers (`ns.local.toml`, user settings) require this Objective's ADR refining ADR 0056 plus explicit provenance and per-family merge rules before activation.

What you see now: low-level `ProjectConfigGateway` reads, direct `ns.toml` filesystem access, Git root probes done solely for configuration, and cwd-as-root assumptions coexist across production consumers. The deep effective-config gateway does not exist yet.

Avoid: new direct `ns.toml` (or future `ns.local.toml`) reads, workflow-owned precedence logic, config-only root probes, constructing the Node config adapter inside workflows, generic TOML deep merge, and activating user settings ahead of the ADR.

Active slice: inventory production readers/mutators and define the effective-read/source-mutation interfaces, then migrate behavior-preservingly in roadmap order.
