# Roadmap

## Work

- [x] PR 1: simplify existing Initiative skill selection before adding CLI support.
  - Evidence: `skills/initiative*/SKILL.md`, `docs/initiative-system.md`, and `CONTEXT.md` now require explicit selection or candidate-list-and-ask behavior.
  - Removed auto-selection from changed/touched Initiative files.
  - When no explicit slug or path is supplied, Initiative operations list candidate Initiatives and ask the user to choose.
  - Preserved the rule against inferring Initiative ownership from branch names, objectives, PR titles, package names, roadmap keywords, or hidden metadata.
- [x] PR 2: establish the new `asdl-initiatives` package, `initiative` CLI surface, and hidden `exec` subgroup.
  - Evidence: `packages/asdl-initiatives/` now defines the `asdl-initiatives` package, standalone `initiative` script, `asdl.plugins` entry point, outer `initiative` group, and hidden empty `exec` subgroup.
  - Root workspace, optional plugin, dev dependency, Ruff source, pytest testpath, and lockfile wiring include the new package.
  - Scenario coverage exercises standalone help/version, hidden-but-invocable `exec`, and top-level plugin discovery smoke behavior.
  - Verification: `uv run pytest packages/asdl-initiatives/tests/scenario tests/scenario/test_plugins.py` and `just` passed.
  - No `exec` operations, Markdown parsing, git/Graphite/brmem integration, or Initiative mutation commands were introduced.
- [x] PR 3: implement `initiative exec list` with JSON and Markdown formats.
  - Evidence: `packages/asdl-initiatives/src/asdl_initiatives/exec/list.py` implements pure filesystem inventory under the hidden `initiative exec list` command.
  - `--format json` returns Initiative slugs, relative paths, closed-marker state, file-presence facts, and update counts.
  - Include open and closed Initiatives by default and sort by slug ascending.
  - `--format md` renders the same inventory as a compact table for direct agent reading.
  - The command does not inspect git state, return changed/touched path facts, read Markdown contents, or produce a selection hint.
  - Coverage includes absent `.asdl/initiatives/`, empty roots, sorted open/closed records, missing required files, direct update counts, ignored non-directory entries, `--format json`, `--format md`, Clinkr's `md` format alias, and plugin smoke invocation.
  - Verification: `uv run pytest packages/asdl-initiatives/tests/scenario packages/asdl-core/tests/unit/clinkr/test_format_option_dispatch.py tests/scenario/test_plugins.py` and `just` passed.
- [x] PR 4: implement `initiative exec read-initiative <slug>` with JSON and Markdown formats.
  - Evidence: `packages/asdl-initiatives/src/asdl_initiatives/exec/read_initiative.py` implements the hidden `initiative exec read-initiative` command and `exec/inventory.py` shares file-presence/update inventory with `list`.
  - Requires an explicit slug, rejects path-shaped input, and resolves only `.asdl/initiatives/<slug>/` without path normalization.
  - `--format json` returns stable envelopes for missing slug, invalid slug, and absent records, plus root/record paths, file presence, closed state, sorted update files, and update counts without raw Markdown content.
  - `--format md` renders raw `initiative.md`, `roadmap.md`, and direct sorted `updates/*.md`, with explicit missing-file notes for incomplete records.
  - Verification: `uv run pytest packages/asdl-initiatives/tests/scenario packages/asdl-initiatives/tests/unit tests/scenario/test_plugins.py` and `just` passed.
- [x] PR 5: implement `initiative exec tracking-gate-facts <slug-or-path> --base-ref <ref>` with JSON and Markdown formats, then simplify `initiative-next` to use it.
  - Require an explicit `--base-ref` for committed-change comparison.
  - `--format json` reports read-only git/worktree evidence for current branch, working tree/index changes, committed changes from `--base-ref` to `HEAD`, selected-Initiative paths, other-Initiative paths, and non-Initiative paths.
  - `--format md` renders those facts compactly for direct agent reading.
  - Keep materiality judgment and base-ref choice in `initiative-next`.
  - Evidence: `packages/asdl-initiatives/src/asdl_initiatives/exec/tracking_gate_facts.py` implements the hidden `initiative exec tracking-gate-facts` command; `asdl_core.git` gained `GitPathChange` and listing APIs (working-tree, index, committed `<base>..HEAD`) on real and fake gateways; `skills/initiative-next/SKILL.md` now calls the command for its Tracking Gate facts; unit and scenario coverage exercise path classification, base-ref handling, slug-or-path resolution, JSON and Markdown rendering.
  - Closeout audit landed in PR 467 (`delegate-initiative-skills-to-exec`): `skills/initiative-current/SKILL.md`, `skills/initiative-update/SKILL.md`, `skills/initiative-close/SKILL.md`, `skills/initiative/SKILL.md`, `skills/initiative-create/SKILL.md`, and `docs/initiative-system.md` now delegate candidate listing, record reading, and closed-marker detection to `initiative exec`; semantic decision rules remain in the skills.
- [x] Update Initiative skills and docs to delegate deterministic mechanics.
  - Evidence: PR 467 (`delegate-initiative-skills-to-exec`) edits the five remaining Initiative skill `SKILL.md` files (`initiative-current`, `initiative-update`, `initiative-close`, `initiative`, `initiative-create`) and `docs/initiative-system.md` to delegate candidate listing to `initiative exec list --format md`, record reading to `initiative exec read-initiative <slug> --format md`, and Tracking Gate path facts to `initiative exec tracking-gate-facts`. The umbrella skill and canonical doc now describe shipped versus future CLI responsibilities and keep the "do not parse Markdown headings, roadmap checkboxes, or prose meaning in CLI code" guard explicit. Mutation guidance remains direct Markdown.
  - Verification: `uv run pytest packages/asdl-initiatives/tests tests/scenario/test_plugins.py` and `just` passed on the PR 467 branch.
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
