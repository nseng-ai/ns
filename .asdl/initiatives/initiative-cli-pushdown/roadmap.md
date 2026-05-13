# Roadmap

## Work

- [ ] Simplify existing Initiative skill selection before adding CLI support.
  - Remove auto-selection from changed/touched Initiative files.
  - When no explicit slug or path is supplied, list candidate Initiatives and ask the user to choose.
  - Preserve the rule against inferring Initiative ownership from branch names, objectives, PR titles, package names, roadmap keywords, or hidden metadata.
- [ ] Establish the new `asdl-initiatives` package, `initiative` CLI surface, and hidden `exec` subgroup.
  - Include standalone and plugin entry points according to repository CLI conventions.
  - Keep the command group focused on Initiative facts, not Initiative meaning.
- [ ] Implement `initiative exec list --format json`.
  - Return Initiative slugs, paths, closed-marker state, required file presence, and update counts.
  - Do not inspect git state, return changed/touched path facts, or produce a selection hint.
  - Cover absent `.asdl/initiatives/`, empty roots, malformed entries, and closed records.
- [ ] Implement `initiative exec read-initiative <slug-or-path> --format json`.
  - Validate explicit slug/path selection under `.asdl/initiatives/<slug>/`.
  - Return missing-slug/path and invalid-path errors as stable JSON.
  - Return file inventory, closed state, and raw Markdown content without parsing headings or roadmap status.
- [ ] Implement `initiative exec tracking-gate-facts <slug-or-path> --format json`.
  - Report read-only git/worktree evidence for current branch, changed paths, selected-Initiative paths, other-Initiative paths, and non-Initiative paths.
  - Keep materiality judgment in `initiative-next`.
- [ ] Update Initiative skills and docs to delegate deterministic mechanics.
  - Shorten repeated inventory, record-reading, closed-marker, and Tracking Gate fact-gathering instructions.
  - Preserve semantic decision rules and user-facing behavior in the skills.
- [ ] Validate the full steelthread.
  - Add scenario/unit/plugin tests for the new CLI surface.
  - Run the repository test/lint suite and fix issues through the normal autofix workflow where applicable.

## Parked

- [ ] Add `--format md` renderers for the Initiative exec commands so agents can read compact Markdown without using `jq` for common values.
- [ ] Add `initiative exec create-skeleton` for creation scaffolding.
- [ ] Add update precheck or timestamped update filename helpers.
- [ ] Add close-marker helpers.
- [ ] Enforce PR tracking policy in CI or preflight tooling.
- [ ] Add structured Initiative data sources that would permit safe non-Markdown parsing in the future.
