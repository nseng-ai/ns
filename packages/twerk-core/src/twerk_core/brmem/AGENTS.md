# twerk_core.brmem

Treat this subpackage as if it were its own package that other parts of `twerk-core` depend on. It is designed to be straightforwardly extractable into a standalone `brmem` package if needed.

`brmem` is a generic branch-scoped key/value store backed by git refs (entries live under `refs/brmem/<namespace>/<encoded-branch>:<key>`). It is consumed by other subpackages — including `objective` — but the namespace is a parameter, not a `brmem` concern. `brmem` must remain agnostic of any specific namespace's schema, slug rules, or workflow.

## Rules

- **Dependency direction is one-way**. The rest of `twerk-core` may import from `twerk_core.brmem`. `twerk_core.brmem` may import from `twerk_core.clinkr` and `twerk_core.git` only.
- **No imports from `objective` or any other sibling**. `objective` builds on `brmem`, never the reverse.
- **No imports from parent `twerk_core`** shared utilities (`format`, `console`, `click_utils`, `plugin`).
- **Self-contained tests**. Tests for `brmem` must not depend on `twerk_core` subpackages outside the allowed import set above.
- **Third-party deps**: only what already lives in `twerk-core`'s `pyproject.toml` and is reachable from the `clinkr` / `git` layer. Do not add new third-party dependencies without promoting `brmem` to its own package first.
