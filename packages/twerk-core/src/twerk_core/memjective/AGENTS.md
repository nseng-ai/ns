# twerk_core.memjective

Treat this subpackage as if it were its own package that the rest of `twerk-core` consumes. It is designed to be straightforwardly extractable into a standalone `memjective` package if needed.

A memjective is a directory of files (`body.md` plus optional `roadmap.md` / `notes.md`) tracked across branches via git refs under `refs/brmem/ns/memjectives/...`. This subpackage owns a workflow system whose mass spans three layers:

- **Python code** that builds on `brmem` storage — slug resolution, repo-wide discovery, canonical-record semantics, and the `memjective` CLI.
- **The `dev-memjective-*` skill family** in `skills/` that drives the create / claim / update / reconcile / next workflow.
- **Schema assets** — `references/mutation-contract.md` and `templates/{body,roadmap,notes}-template.md` — that codify what a memjective document is.

`brmem` is the storage primitive; `memjective` is the application built on it. The namespace string (`MEMJECTIVE_NAMESPACE`), the body/roadmap/notes filename constants, and the slug rules live here, not in `brmem`, so that `brmem` stays generic.

## Rules

- **Dependency direction is one-way**. The rest of `twerk-core` may import from `twerk_core.memjective`. `twerk_core.memjective` may import from `twerk_core.clinkr`, `twerk_core.git`, `twerk_core.gh`, and `twerk_core.brmem` only.
- **`brmem` must never import from `memjective`**. If `brmem` ever needs a memjective-specific concept, that concept belongs here, not there.
- **Parent `twerk_core` shared utilities** are limited to the minimum set actually used: `twerk_core.console` (rich tables / consoles for CLI output) and `twerk_core.plugin` (`TwerkPluginSpec` for the plugin entry point). New imports from `twerk_core.format` / `twerk_core.click_utils` / etc. should be justified — they all become graduation work when this subpackage extracts.
- **Self-contained tests**. Tests for `memjective` must not depend on `twerk_core` subpackages outside the allowed import set above.
- **Third-party deps**: only what already lives in `twerk-core`'s `pyproject.toml` and is reachable from the `clinkr` / `git` / `gh` / `brmem` layer. New third-party deps trigger graduation, not a quiet `pyproject.toml` edit.
