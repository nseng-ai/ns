# twerk-core

`twerk-core` is the shared foundation for the twerk monorepo's CLIs and plugins. It also functions as a **labs / incubator**: several of its subpackages are explicitly designed to graduate into their own standalone packages, but bundling them here avoids per-package release overhead until graduation is justified.

## In-incubation subpackages

Each in-incubation subpackage owns its own `AGENTS.md` codifying allowed imports and extractability rules. Layer ordering, bottom-up:

| Subpackage | Allowed `twerk_core` imports |
| ---------- | ---------------------------- |
| `clinkr`   | (none — stdlib + click only) |
| `git`      | (none — stdlib only)         |
| `gh`       | (none — stdlib only)         |
| `gt`       | (none — stdlib only)         |

Dependencies are strictly one-way down the layer order; no upward or sideways imports.

The graduation candidate is `clinkr`. `gh` and `git` follow the same internal-discipline convention but are gateway modules with narrower graduation paths.

## Universal labs rules

These hold for every in-incubation subpackage; per-subpackage `AGENTS.md` files refine them:

- **One-way dependencies**. A labs subpackage may import only from labs subpackages strictly below it in the layer order.
- **Minimize imports from parent `twerk_core`** shared utilities (`format`, `console`, `click_utils`, `plugin`). Each per-subpackage `AGENTS.md` lists the exact set actually used; new ones should be justified, since they all become graduation work when the subpackage extracts.
- **Self-contained tests**. A subpackage's tests must not depend on other `twerk_core` subpackages outside its allowed import set.
- **New third-party deps trigger graduation**. If a labs subpackage needs a dependency that does not already live in `twerk-core`'s `pyproject.toml`, promote it to a real package first rather than expanding the shared dependency surface.

## Top-level utilities (not labs)

Files at the top of `twerk_core/` — `format.py`, `console.py`, `click_utils.py`, `plugin.py` — are shared utilities bound to `twerk-core`. They are not on a graduation path and exist to glue the labs subpackages together at the CLI/plugin layer.
