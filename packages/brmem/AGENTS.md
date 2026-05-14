# brmem

`brmem` is the generic Branch Memory System backed by git refs. Entries live under locators such as `refs/brmem/ns/<namespace>/<encoded-branch>:<key>`. It is consumed by other packages, but the Namespace is a parameter, not a `brmem` concern. `brmem` must remain agnostic of any specific Namespace's schema, slug rules, or workflow.

## Rules

- **Allowed `asdl-core` imports**: `asdl_core.clinkr`, `asdl_core.git` only. No `gh`, no `format` / `console` / `click_utils` / `plugin`.
- **No imports from sibling consumers**. `brmem` must never import from any package built on top of it.
- **Self-contained tests**. Tests for `brmem` must not depend on `asdl_core` subpackages outside the allowed import set above.
- **Third-party deps**: declared in this package's own `pyproject.toml`. Do not rely on transitive availability through `asdl-core`.
