# Roaster Settings Loader Migration

## Summary

Local branch `point-system-roaster-settings-loader-ZdmM9j` commit `d9a13235f` migrated Roaster settings (`[roaster.diff]` and `[roaster.model_profiles]`) onto the shared kernel `ns.toml` loader with declared Zod settings schemas. The migration preserves the existing table shapes and validation/default semantics, declares Roaster settings metadata in the extension manifests, and removes the reviews package's direct `smol-toml` dependency.

## Objective Impact

This advances the declared-settings roadmap row by completing the Roaster settings migration. Together with the prior areg slice, the remaining named settings migration is ns-init harnesses.

Validation evidence from the runner step: targeted Roaster/reviews and kernel tests passed; `just ts-check`, `just ts-lint`, `just dprint-check`, and `git diff --check` passed after deterministic formatter fixes. Full `just` still reaches the known unrelated `@nseng-ai/objectives` topology-circle style-guard failure recorded in earlier updates.

## Follow-Ups

- Migrate ns-init harness settings onto the shared kernel loader.
- After ns-init lands, re-scan for remaining direct `smol-toml` project config parsers.
