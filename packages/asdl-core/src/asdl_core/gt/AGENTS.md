# asdl_core.gt

This subpackage should be treated as its own package. It is designed to be straightforwardly extractable into a standalone package if needed.

## Rules

- **No imports from parent `asdl_core`**. This subpackage must not depend on anything else in asdl-core.
- **Stdlib-only dependencies**. All imports must be from the Python standard library (`abc`, `dataclasses`, `subprocess`, `typing`, etc.).
