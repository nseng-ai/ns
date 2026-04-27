# brmem

`brmem` is a generic branch-scoped key/value store backed by git refs (entries live under `refs/brmem/<namespace>/<encoded-branch>:<key>`). It is consumed by other packages — including `twerk-objectives` — but the namespace is a parameter, not a `brmem` concern. `brmem` must remain agnostic of any specific namespace's schema, slug rules, or workflow.

## Rules

- **Allowed `twerk-core` imports**: `twerk_core.clinkr`, `twerk_core.git` only. No `gh`, no `format` / `console` / `click_utils` / `plugin`.
- **No imports from sibling consumers**. `brmem` must never import from `twerk_objectives` or any other package built on top of it.
- **Self-contained tests**. Tests for `brmem` must not depend on `twerk_core` subpackages outside the allowed import set above.
- **Third-party deps**: declared in this package's own `pyproject.toml`. Do not rely on transitive availability through `twerk-core`.
