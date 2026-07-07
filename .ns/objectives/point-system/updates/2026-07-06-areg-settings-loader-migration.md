# Areg Settings Loader Migration

## Summary

Local branch `point-system-settings-loader-Pa0ixh` commit `a56987991` migrated the `areg` `[areg].agents` config surface onto the shared kernel `ns.toml` loader. The slice adds a declared Zod settings schema for `areg`, uses the kernel loader for parsing/validation, and removes areg's direct `smol-toml` dependency.

The kernel loader also gained coverage for settings-only consumers coexisting with unrelated `[points]` entries.

## Objective Impact

This advances the declared-settings roadmap row by completing one of the three named settings migrations. The row remains in progress until roaster (`diff`, `model_profiles`) and ns-init (`harnesses`) also use the shared loader and their ad-hoc parsers/dependencies are removed.

Validation evidence from the runner step: areg tests passed, kernel tests passed, `just ts-format-check`, `just ts-lint`, `just ts-check`, `just dprint-check`, and `git diff --check` passed. Full `just` still reaches the known unrelated `@nseng-ai/objectives` topology-circle style-guard failure recorded in earlier updates.

## Follow-Ups

- Migrate roaster `[roaster.diff]` / `[roaster.model_profiles]` onto declared settings through the kernel loader.
- Migrate ns-init harness config onto declared settings through the kernel loader.
