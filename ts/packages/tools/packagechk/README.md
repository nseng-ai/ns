# `@nseng-ai/packagechk`

`packagechk` checks public package registry state for prospective package names.

It answers questions such as:

- Is this name available on npm, PyPI, or Homebrew?
- Is this name already taken, and what public package metadata is visible?
- Can we claim an available npm or PyPI name by publishing a minimal placeholder package?

## Scope

In scope:

- Public registry lookups for npm, PyPI, and Homebrew.
- Human and JSON reports for package-name availability.
- Explicit claim commands for registries where this tool owns the claiming workflow.

Out of scope:

- Workspace package architecture checks.
- TypeScript import-boundary or deep-import enforcement.
- ns extension dependency DAG validation.
- Package export-map policy for local workspace packages.
- General repository linting, formatting, or dependency governance.

Those repository-internal checks belong in focused workspace tests or dedicated architecture tooling, not in `packagechk`.
