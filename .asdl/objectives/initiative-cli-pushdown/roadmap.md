# Roadmap

## Work

- [x] PR 1: simplify existing Objective skill selection before adding CLI support.
  - Evidence: `skills/objective*/SKILL.md`, `docs/objective-system.md`, and `CONTEXT.md` now require explicit selection or candidate-list-and-ask behavior.
  - Removed auto-selection from changed/touched Objective files.
  - When no explicit slug or path is supplied, Objective operations list candidate Objectives and ask the user to choose.
  - Preserved the rule against inferring Objective ownership from branch names, objectives, PR titles, package names, roadmap keywords, or hidden metadata.
- [x] PR 2: establish the new `asdl-objectives` package, `objective` CLI surface, and hidden `exec` subgroup.
  - Evidence: `packages/asdl-objectives/` now defines the `asdl-objectives` package, standalone `objective` script, `asdl.plugins` entry point, outer `objective` group, and hidden empty `exec` subgroup.
  - Root workspace, optional plugin, dev dependency, Ruff source, pytest testpath, and lockfile wiring include the new package.
  - Scenario coverage exercises standalone help/version, hidden-but-invocable `exec`, and top-level plugin discovery smoke behavior.
  - Verification: `uv run pytest packages/asdl-objectives/tests/scenario tests/scenario/test_plugins.py` and `just` passed.
  - No `exec` operations, Markdown parsing, git/Graphite/brmem integration, or Objective mutation commands were introduced.
- [x] PR 3: implement `objective exec list` with JSON and Markdown formats.
  - Evidence: `packages/asdl-objectives/src/asdl_objectives/exec/list.py` implements pure filesystem inventory under the hidden `objective exec list` command.
  - `--format json` returns Objective slugs, relative paths, closed-marker state, file-presence facts, and update counts.
  - Include open and closed Objectives by default and sort by slug ascending.
  - `--format md` renders the same inventory as a compact table for direct agent reading.
  - The command does not inspect git state, return changed/touched path facts, read Markdown contents, or produce a selection hint.
  - Coverage includes absent `.asdl/objectives/`, empty roots, sorted open/closed records, missing required files, direct update counts, ignored non-directory entries, `--format json`, `--format md`, Clinkr's `md` format alias, and plugin smoke invocation.
  - Verification: `uv run pytest packages/asdl-objectives/tests/scenario packages/asdl-core/tests/unit/clinkr/test_format_option_dispatch.py tests/scenario/test_plugins.py` and `just` passed.
- [x] PR 4: implement `objective exec read-objective <slug>` with JSON and Markdown formats.
  - Evidence: `packages/asdl-objectives/src/asdl_objectives/exec/read_objective.py` implements the hidden `objective exec read-objective` command and `exec/inventory.py` shares file-presence/update inventory with `list`.
  - Requires an explicit slug, rejects path-shaped input, and resolves only `.asdl/objectives/<slug>/` without path normalization.
  - `--format json` returns stable envelopes for missing slug, invalid slug, and absent records, plus root/record paths, file presence, closed state, sorted update files, and update counts without raw Markdown content.
  - `--format md` renders raw `objective.md`, `roadmap.md`, and direct sorted `updates/*.md`, with explicit missing-file notes for incomplete records.
  - Verification: `uv run pytest packages/asdl-objectives/tests/scenario packages/asdl-objectives/tests/unit tests/scenario/test_plugins.py` and `just` passed.
- [~] Update Objective skills and docs to delegate deterministic mechanics for the two shipped commands.
  - Evidence in this branch: commit `64977cb1` (`[cp] Delegate Objective skills to exec commands`) edits the five remaining Objective skill `SKILL.md` files (`objective-current`, `objective-update`, `objective-close`, `objective`, `objective-create`) and `docs/objective-system.md` to delegate candidate listing to `objective exec list --format md` and record reading to `objective exec read-objective <slug> --format md`. The umbrella skill and canonical doc describe shipped versus future CLI responsibilities and keep the "do not parse Markdown headings, roadmap checkboxes, or prose meaning in CLI code" guard explicit.
  - Why `[~]`: the same edits also reference `objective exec tracking-gate-facts` as a shipped command. With PR 5 descoped on 2026-05-14, those references no longer match the Objective's scope and need to be removed or softened to future work. The candidate-listing and record-reading delegations themselves are correct on this branch.
  - Follow-up: revise `skills/objective/SKILL.md`, `skills/objective-next/SKILL.md` if it still references the command, and `docs/objective-system.md` to drop `objective exec tracking-gate-facts` references from the shipped surface; keep Tracking Gate materiality entirely with the skill/agent.
- [ ] Validate the reduced steelthread (two commands only).
  - Status: incomplete on this branch. Commit `598105c8` (`Cover objective exec renderer and error branches with scenario tests`) added five scenario tests in `packages/asdl-objectives/tests/scenario/test_objective_cli.py` that import `GitPathChange` from `asdl_core.git.types` and exercise `objective exec tracking-gate-facts`. With PR 5 descoped, those tests are out of scope for this Objective and the test module fails to import (`ImportError: cannot import name 'GitPathChange' from 'asdl_core.git.types'`), so `uv run pytest packages/asdl-objectives/tests` fails at collection.
  - Follow-up: remove the five `tracking-gate-facts`-coupled scenario tests from this branch, then re-run `uv run pytest packages/asdl-objectives/tests tests/scenario/test_plugins.py` and `just` against the reduced steelthread and record the verification result in a new update before closing.

## Parked

- [ ] `objective exec tracking-gate-facts <slug-or-path> --base-ref <ref>` for deterministic Tracking Gate evidence (current branch facts, working-tree/index changes, committed `<base>..HEAD` changes, and selected/other/non-Objective path classification). Descoped from this Objective on 2026-05-14; if revisited, pick up as a separate Objective so this one can close on the two shipped commands. The previously-prepared `add-tracking-gate-facts-and-git-path-change-suppor` branch still exists locally and on `origin` if its commits are useful as a starting point.
- [ ] Add `objective exec create-skeleton` for creation scaffolding.
- [ ] Add update precheck or timestamped update filename helpers.
- [ ] Add close-marker helpers.
- [ ] Enforce PR tracking policy in CI or preflight tooling.
- [ ] Add structured Objective data sources that would permit safe non-Markdown parsing in the future.
