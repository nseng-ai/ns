# twerk_core.gh

This subpackage should be treated as its own package. It is designed to be straightforwardly extractable into a standalone package if needed.

## Rules

- **No imports from parent `twerk_core`**. This subpackage must not depend on anything else in twerk-core.
- **Stdlib-only dependencies**. All imports must be from the Python standard library (`abc`, `dataclasses`, `typing`, etc.).

## Sub-gateway pattern

See [docs/gh-sub-gateway-pattern.md](/docs/gh-sub-gateway-pattern.md) for the full pattern documentation.
