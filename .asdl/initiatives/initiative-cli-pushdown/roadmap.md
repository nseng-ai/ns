# Roadmap

## Work

- [ ] PR 1: simplify existing Initiative skill selection before adding CLI support.
  - Remove auto-selection from changed/touched Initiative files.
  - When no explicit slug or path is supplied, list candidate Initiatives and ask the user to choose.
  - Preserve the rule against inferring Initiative ownership from branch names, objectives, PR titles, package names, roadmap keywords, or hidden metadata.
- [ ] PR 2: establish the new `asdl-initiatives` package, `initiative` CLI surface, and hidden `exec` subgroup.
  - Include standalone and plugin entry points according to repository CLI conventions.
  - Keep the command group focused on Initiative facts, not Initiative meaning.
- [ ] PR 3: implement `initiative exec list` with JSON and Markdown formats.
  - `--format json` returns Initiative slugs, paths, closed-marker state, required file presence, and update counts.
  - Include open and closed Initiatives by default and sort by slug ascending.
  - `--format md` renders the same inventory compactly for direct agent reading.
  - Do not inspect git state, return changed/touched path facts, or produce a selection hint.
  - Cover absent `.asdl/initiatives/`, empty roots, malformed entries, and closed records.
- [ ] PR 4: implement `initiative exec read-initiative <slug-or-path>` with JSON and Markdown formats.
  - Validate explicit slug/path selection under `.asdl/initiatives/<slug>/`.
  - `--format json` returns missing-slug/path and invalid-path errors as stable JSON plus file inventory, closed state, and paths by default.
  - `--format md` includes the raw `initiative.md`, `roadmap.md`, and all update Markdown by default without parsing headings or roadmap status.
- [ ] PR 5: implement `initiative exec tracking-gate-facts <slug-or-path> --base-ref <ref>` with JSON and Markdown formats, then simplify `initiative-next` to use it.
  - Require an explicit `--base-ref` for committed-change comparison.
  - `--format json` reports read-only git/worktree evidence for current branch, working tree/index changes, committed changes from `--base-ref` to `HEAD`, selected-Initiative paths, other-Initiative paths, and non-Initiative paths.
  - `--format md` renders those facts compactly for direct agent reading.
  - Keep materiality judgment and base-ref choice in `initiative-next`.
- [ ] Update Initiative skills and docs to delegate deterministic mechanics.
  - Shorten repeated inventory, record-reading, closed-marker, and Tracking Gate fact-gathering instructions.
  - Preserve semantic decision rules and user-facing behavior in the skills.
- [ ] Validate the full steelthread.
  - Add scenario/unit/plugin tests for the new CLI surface.
  - Cover JSON contracts and Markdown renderers.
  - Run the repository test/lint suite and fix issues through the normal autofix workflow where applicable.

## Parked

- [ ] Add `initiative exec create-skeleton` for creation scaffolding.
- [ ] Add update precheck or timestamped update filename helpers.
- [ ] Add close-marker helpers.
- [ ] Enforce PR tracking policy in CI or preflight tooling.
- [ ] Add structured Initiative data sources that would permit safe non-Markdown parsing in the future.
