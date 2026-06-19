# Read-Only TypeScript Shell

## Summary

The first stack slice created `@asdl/vibechk` under `ts/packages/vibechk` with a `vibechk` bin, TypeScript source entry point, package-local schema/store/report modules, and Vitest coverage for the read-only contract.

The slice codifies the implemented Python contract for schema-version-1 bundle reading: snake_case `bundle.json` keys, nullable unavailable metrics, store precedence (`--store`, `VIBECHK_HOME`, `XDG_STATE_HOME/vibechk`, then `HOME/.local/state/vibechk`), missing optional artifact files as empty text, unique run-id prefix resolution, missing-store empty listing, newest-first run listing, and Markdown `show` / `diff` reports.

A Clinkr command-surface collision prevents owning a schema field literally named `format`, so the implementation uses an internal `output_format` field while normalizing `vibechk runs --format table|json` before command dispatch. The user-facing Python invocation remains preserved for `runs`; other commands keep the normal Clinkr `--format` behavior.

Validation: targeted `@asdl/vibechk` check and tests passed; `pnpm --dir ts run check`, `pnpm --dir ts run test`, `just ts-guard`, and `just dprint-check` passed.

## Objective Impact

The contract-inventory and read-only TypeScript package roadmap rows are complete. The repository is now in a temporary dual-implementation state: TypeScript can read and report existing Python-created bundles, but the TypeScript `run` command is intentionally still a placeholder until the next slice ports runner execution, bundle writing, and git result-branch behavior.

Python remains the active documented/default path until the later cutover slice proves `run` parity and updates docs/distribution. No missing v1 features (`publish`, `codex`, or `pi`) were added.

## Follow-Ups

- Port `run`, the default `claude` runner adapter, fake runner seam, bundle writing, and git/result-branch safety in the next stack slice.
- Preserve the schema-version-1 snake_case bundle writing contract when `run` is implemented.
- Do not retire Python or update default invocation docs until the mutation-heavy `run` path has passed targeted and workspace validation.
