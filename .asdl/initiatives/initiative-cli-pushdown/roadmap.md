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
- [~] Update Initiative skills and docs to delegate deterministic mechanics for the two shipped commands.
  - Evidence in this branch: commit `64977cb1` (`[cp] Delegate Initiative skills to exec commands`) edits the five remaining Initiative skill `SKILL.md` files (`initiative-current`, `initiative-update`, `initiative-close`, `initiative`, `initiative-create`) and `docs/initiative-system.md` to delegate candidate listing to `initiative exec list --format md` and record reading to `initiative exec read-initiative <slug> --format md`. The umbrella skill and canonical doc describe shipped versus future CLI responsibilities and keep the "do not parse Markdown headings, roadmap checkboxes, or prose meaning in CLI code" guard explicit.
  - Why `[~]`: the same edits also reference `initiative exec tracking-gate-facts` as a shipped command. With PR 5 descoped on 2026-05-14, those references no longer match the Initiative's scope and need to be removed or softened to future work. The candidate-listing and record-reading delegations themselves are correct on this branch.
  - Follow-up: revise `skills/initiative/SKILL.md`, `skills/initiative-next/SKILL.md` if it still references the command, and `docs/initiative-system.md` to drop `initiative exec tracking-gate-facts` references from the shipped surface; keep Tracking Gate materiality entirely with the skill/agent.
- [ ] Validate the reduced steelthread (two commands only).
  - Status: incomplete on this branch. Commit `598105c8` (`Cover initiative exec renderer and error branches with scenario tests`) added five scenario tests in `packages/asdl-initiatives/tests/scenario/test_initiative_cli.py` that import `GitPathChange` from `asdl_core.git.types` and exercise `initiative exec tracking-gate-facts`. With PR 5 descoped, those tests are out of scope for this Initiative and the test module fails to import (`ImportError: cannot import name 'GitPathChange' from 'asdl_core.git.types'`), so `uv run pytest packages/asdl-initiatives/tests` fails at collection.
  - Follow-up: remove the five `tracking-gate-facts`-coupled scenario tests from this branch, then re-run `uv run pytest packages/asdl-initiatives/tests tests/scenario/test_plugins.py` and `just` against the reduced steelthread and record the verification result in a new update before closing.

## Parked

- [ ] `initiative exec tracking-gate-facts <slug-or-path> --base-ref <ref>` for deterministic Tracking Gate evidence (current branch facts, working-tree/index changes, committed `<base>..HEAD` changes, and selected/other/non-Initiative path classification). Descoped from this Initiative on 2026-05-14; if revisited, pick up as a separate Initiative so this one can close on the two shipped commands. The previously-prepared `add-tracking-gate-facts-and-git-path-change-suppor` branch still exists locally and on `origin` if its commits are useful as a starting point.
- [ ] Add `initiative exec create-skeleton` for creation scaffolding.
- [ ] Add update precheck or timestamped update filename helpers.
- [ ] Add close-marker helpers.
- [ ] Enforce PR tracking policy in CI or preflight tooling.
- [ ] Add structured Initiative data sources that would permit safe non-Markdown parsing in the future.
