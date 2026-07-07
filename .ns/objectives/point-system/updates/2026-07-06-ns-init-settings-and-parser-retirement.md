# Ns-Init Settings and Parser Retirement

## Summary

Local branch `point-system/ns-init-settings-loader` commit `f73c3cde` migrated ns-init harness parsing onto the shared kernel project-config loader with a declared top-level harnesses settings schema. The slice preserves the existing harness config shape and validation diagnostics, removes ns-init's direct `smol-toml` dependency, and adds tests for coexistence with point-system config.

The runner also scanned the four predecessor areas (flow hooks, roaster settings, areg agents, ns-init harnesses) and found no remaining direct `smol-toml` imports or dependencies outside the kernel loader.

## Objective Impact

This completes the declared-settings migration roadmap row and lets the initial kernel-loader row be considered complete as well: the shared kernel loader exists, real consumers have migrated, and the four targeted ad-hoc parser surfaces are retired. The Objective remains open for the `ns extension points` / `ns extension point <id>` CLI and ADR/CONTEXT graduation rows.

Validation evidence from the runner step: targeted ns-init and kernel tests passed; `just ts-lint`, `just ts-check`, `just dprint-check`, `just ts-format-check`, and `git diff --check` passed. Full `just` still reaches the known unrelated `@nseng-ai/objectives` topology-circle style-guard failure recorded in earlier updates.

## Follow-Ups

- Implement CLI introspection: `ns extension points` and `ns extension point <id>`.
- After CLI lands, steer with the user before ADR/CONTEXT graduation wording.
