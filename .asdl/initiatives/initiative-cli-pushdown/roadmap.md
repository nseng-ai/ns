# Roadmap

## Work

- [ ] Establish the `initiative` CLI surface and hidden `exec` subgroup.
  - Include standalone and plugin entry points according to repository CLI conventions.
  - Keep the command group focused on Initiative facts, not Initiative meaning.
- [ ] Implement `initiative exec list --format json`.
  - Return Initiative slugs, paths, closed-marker state, required file presence, update counts, and touched-Initiative facts.
  - Cover absent `.asdl/initiatives/`, empty roots, malformed entries, closed records, and changed-path edge cases.
- [ ] Implement `initiative exec context [slug-or-path] --format json`.
  - Validate explicit slug/path selection under `.asdl/initiatives/<slug>/`.
  - Resolve omitted selection from touched Initiative files or return none/ambiguous facts.
  - Return file inventory, closed state, and raw Markdown content without parsing headings or roadmap status.
- [ ] Implement `initiative exec tracking-gate-facts <slug-or-path> --format json`.
  - Report read-only git/worktree evidence for current branch, changed paths, selected-Initiative paths, other-Initiative paths, and non-Initiative paths.
  - Keep materiality judgment in `initiative-next`.
- [ ] Update Initiative skills and docs to delegate deterministic mechanics.
  - Shorten repeated selection, inventory, closed-marker, and Tracking Gate fact-gathering instructions.
  - Preserve semantic decision rules and user-facing behavior in the skills.
- [ ] Validate the full steelthread.
  - Add scenario/unit/plugin tests for the new CLI surface.
  - Run the repository test/lint suite and fix issues through the normal autofix workflow where applicable.

## Parked

- [ ] Add `initiative exec create-skeleton` for creation scaffolding.
- [ ] Add update precheck or timestamped update filename helpers.
- [ ] Add close-marker helpers.
- [ ] Enforce PR tracking policy in CI or preflight tooling.
- [ ] Add structured Initiative data sources that would permit safe non-Markdown parsing in the future.
