# twerk-objectives

`twerk-objectives` provides branch-scoped planning documents built on top of `twerk-core`'s `brmem` storage. An objective is a directory of files (`body.md` plus optional `roadmap.md` / `notes.md`) tracked across branches via git refs under `refs/brmem/ns/objectives/...`. The package owns the schema, slug rules, canonical-record semantics, and the `objective` CLI surface that drives the `objective-*` skill family.

This package is a `twerk` plugin discovered via the `twerk.plugins` entry-point and also installs a standalone `objective` CLI binary. `brmem` remains the storage primitive in `twerk-core`; the namespace string (`OBJECTIVE_NAMESPACE`), filename constants, and slug rules live here so `brmem` stays generic.

## Rules

- **Allowed `twerk-core` imports**: `twerk_core.clinkr`, `twerk_core.git`, `twerk_core.gh`, `twerk_core.brmem`, plus the shared utilities `twerk_core.console` (rich tables / consoles for CLI output) and `twerk_core.plugin` (`TwerkPluginSpec` for the plugin entry point). New imports from `twerk_core.format` / `twerk_core.click_utils` / etc. should be justified.
- **`brmem` must never import from `twerk_objectives`**. If `brmem` ever needs an objective-specific concept, that concept belongs here, not there.
- **Self-contained tests**. Tests for `twerk_objectives` must not depend on `twerk_core` subpackages outside the allowed import set above.
- **Third-party deps**: only what is reachable from the `clinkr` / `git` / `gh` / `brmem` layer of `twerk-core`. New third-party deps go in this package's `pyproject.toml`, not in `twerk-core`.
