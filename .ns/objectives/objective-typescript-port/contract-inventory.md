# Objective CLI Contract Inventory

## Inventory Date and Source State

- Inventory timestamp: 2026-06-15T201824Z.
- Inventory branch / HEAD: `objective-typescript-port-contract-inventory` at `bf037b6a0`.
- Setup branch status before writing was clean, and no active or archived `.asdl/objectives/objective-typescript-port/` record existed.
- Inspection commands included:
  - `objective exec read-objective port-asdl-toolkit-to-typescript --format md`
  - `objective exec read-objective objective-typescript-port --format json || true`
  - `rg -n "objective( exec| list| archive| --|$)|asdl objective|objective exec" skills .agents .claude ts packages src tests justfile pyproject.toml`
  - `rg -n "runner-subagent-usage|read-objective|list-candidates|objective list --minimal|objective list --names" skills .agents .claude ts packages src tests`
  - `objective -h`, `objective list --help`, `objective exec --help`, and `objective list --minimal --status all --format json`
- Source evidence read for this inventory includes `CONTEXT.md`, `CONTEXT-MAP.md`, `.asdl/objectives/port-asdl-toolkit-to-typescript/porting-playbook.md`, `packages/asdl-objectives/**`, `packages/asdl-objectives/tests/**`, `skills/objective*/SKILL.md`, `ts/packages/pi-extension-runtime/src/objective-list.ts`, `ts/packages/pi-extension-runtime/src/objective-selection.ts`, `ts/packages/pi-extensions/src/objective.ts`, `ts/packages/ccc/src/cmux/objective-sidebar.ts`, `pyproject.toml`, `justfile`, and nearby TypeScript package manifests.

## Durable Storage and Domain Contracts

- Objectives are checked-in durable narrative roadmap records, not hidden agent state, tickets, workflow controllers, state machines, or task databases (`CONTEXT.md`).
- Active Objective Root is `.asdl/objectives/`; Objective Archive Root is `.asdl/objective-archive/` (`packages/asdl-objectives/src/asdl_objectives/objective_storage.py`).
- Archive state is physical location. `objective archive <slug>` moves the whole record to `.asdl/objective-archive/<slug>`; `objective archive <slug> --unarchive` moves it back without changing slug, prose, updates, or closed/open meaning.
- Closure state is the direct `closed.md` marker under an active record directory. Closure meaning belongs in `objective.md` under `## Closure`; nested `closed.md` does not close a record.
- Semantic Updates are immutable historical records under `updates/`. Future Objective tooling must not rewrite old update files to make the migration story cleaner.
- Slug identity is a single directory name. Current validation rejects `""`, `.`, `..`, `/`, and `\\` path-shaped slugs.
- `FilesystemObjectiveStorage.checkout_inventory()` lists direct child directories under `.asdl/objectives`; incomplete child directories still count as records for deterministic inventory, while archive-root records are not active-root records.
- CLI owns deterministic facts: record inventory, file presence, update-file inventory, closed-marker presence, current checkout dirty markers, git latest-touch/branch attribution, and machine envelopes. Semantic interpretation remains in skills/agents and Markdown prose.
- Explicitly forbidden port changes: hidden Objective registries, YAML/frontmatter metadata, UUID identities, Branch Memory Objective storage, and semantic Markdown parsing as a CLI state machine.

## Public Command Surfaces

### Standalone `objective`

Current package metadata:

- `packages/asdl-objectives/pyproject.toml` declares project `asdl-objectives` and console script `objective = "asdl_objectives.main:main"`.
- `packages/asdl-objectives/src/asdl_objectives/main.py` builds the standalone CLI with `build_standalone_cli(build_objective_plugin(), package_name="asdl-objectives", entry_point="asdl_objectives.main:main")`.
- `objective -h` exposes `archive`, `list`, `--version`, `--runtime`, and help. The hidden `exec` group is invocable but absent from top-level help.
- `packages/asdl-objectives/tests/scenario/test_objective_cli.py` asserts `objective gt ...` is not registered. Stale historical Objective GT references exist in old Objective updates, but live source has no tracked `objective gt` Python files.

### `objective list`

- Source: `packages/asdl-objectives/src/asdl_objectives/list.py`, `list_models.py`, `list_render.py`, `list_status.py`, `list_updates.py`, and `list_branch_attribution.py`.
- Help exposes `--names`, `--status [all|active|open|closed]`, `--minimal`, `--format [human|json|markdown|md]`, and `--json-schema`.
- Default mode includes local branch attribution (`updated_branches_included: true` in JSON when not `--minimal`/`--names`). `--minimal` hides branch attribution. `--names` emits filtered slugs only, one per line, without headings.
- Status filtering is checkout-local active-root filtering. `active` and `open` mean open active-root records; `closed` includes direct-`closed.md` records; `all` includes open and closed active-root records. Archived records are omitted even with `--status all`.
- JSON output uses the Clinkr machine envelope with `exit_code` and `data`. Current data fields include `trunk_branch`, `root_path`, `status_filter`, `names_only`, optional `updated_branches_included`, optional `updated_branches_truncated`, and `records` containing `slug`, `status`, `latest_update_iso`, and optional `updated_branches`.
- Human and Markdown renderers show the record root, status filter, `○ open` / `✓ closed` labels, latest update age, optional updated-branch rows, and a truncation note if branch attribution is limited. Dirty active records get a `(x)` marker in human/Markdown latest-update display, but the JSON record shape intentionally stays unchanged.
- Removed/invalid list surfaces are negative behavior to preserve or deliberately reclassify: old flags such as `--branches` are rejected, and `--status in-flight` is invalid.

### `objective archive`

- Source: `packages/asdl-objectives/src/asdl_objectives/archive.py` and storage helpers.
- `objective archive [SLUG]` archives an active record; `objective archive [SLUG] --unarchive` restores an archived record to active discovery.
- The operation refuses missing slugs, path-shaped slugs, absent sources, non-directory sources, and destination collisions. Collision refusal preserves destination content and never merges records.
- JSON result fields include `status`, `error`, `slug`, `direction`, `source_path`, `destination_path`, `source_exists`, `destination_exists`, and `moved` inside the Clinkr envelope.
- Human output starts with an archived/unarchived sentence that includes the slug in backticks, then lists the moved source/destination paths.

### Hidden `objective exec`

- Source: `packages/asdl-objectives/src/asdl_objectives/exec/group.py`; the group is built as `ClinkrGroup(name="exec", ..., hidden=True)` and mounted by `build_objective_group()`.
- `objective exec --help` is intentionally invocable and lists `list-candidates`, `read-objective`, and `runner-subagent-usage`; top-level `objective -h` hides `exec`.
- `list-candidates` (`exec/list_candidates.py`) emits active open candidate slugs/statuses for shell/agent autocomplete. Human output is tab-separated `slug<TAB>status`; JSON includes `records: [{slug, status}]`.
- `read-objective` (`exec/read_objective.py`) reads one active Objective record by explicit slug. JSON reports `status`, `error`, `root_path`, `root_exists`, `slug`, `path`, `exists`, `closed`, `files`, `updates`, and `update_count` but intentionally omits raw Markdown content. Markdown output renders deterministic record facts followed by raw `objective.md`, `roadmap.md`, and direct sorted update Markdown; missing files/directories are noted.
- `runner-subagent-usage` (`exec/runner_subagent_usage.py`) summarizes Pi runner subagent JSONL usage telemetry. JSON includes per-session status/errors/models/token/cost/peak-context fields and aggregate totals. Markdown renders a table plus aggregate summary. Missing arguments are a negative Clinkr result.

### `asdl objective` plugin path

- Current existence: `packages/asdl-objectives/pyproject.toml` declares an `asdl.plugins` entry point `objective = "asdl_objectives.plugin:build_objective_plugin"`; `plugin.py` returns `AsdlPluginSpec(build_group=build_objective_group, context_factory=build_objective_context)`.
- Test coverage: `tests/scenario/test_plugins.py::test_objective_plugin_integration` mounts the plugin under a parent `asdl` group, asserts help/list behavior, confirms hidden `exec` is not in top-level help but is invocable, and asserts `asdl objective list --format json` envelope shape.
- Consumer grep found no obvious skill or TS runtime caller of `asdl objective`; skills and TS wrappers shell out to standalone `objective`. The plugin path still has a test contract and must be intentionally retired or preserved in a later cutover decision.

## Machine, Markdown, and Human Output Contracts

- Machine outputs follow the Python Clinkr envelope shape: successful examples use `{ "exit_code": 0, "data": ... }`; failures and negative results use non-zero `exit_code` plus `message` and structured `data` when the command has a negative result payload.
- Existing TypeScript consumers parse snake_case Python-envelope fields. `ts/packages/pi-extension-runtime/src/objective-list.ts` requires `trunk_branch`, `root_path`, `status_filter`, `names_only`, and `records`; each record requires `slug`, `status`, and `latest_update_iso`.
- `--format md` is a durable skill contract for `objective list --minimal --format md` and `objective exec read-objective <slug> --format md`.
- Names-only output is a durable machine-readable text contract: `objective list --names` emits slug lines only, not a Markdown heading/table.
- Dirty markers are human/Markdown-only: tests assert dirty Objective markers appear in human/Markdown but not in JSON records.
- Error/negative output contracts worth preserving or explicitly deciding later include invalid slug/path messages, missing-source archive envelopes, unavailable repo/trunk failure envelopes, invalid JSON handling in TS consumers, and Clinkr help/schema behavior.

## Skill, Pi, and CCC Consumers

Skill consumers under `skills/objective*`:

- `skills/objective/SKILL.md` defines Objective domain semantics, requires explicit slug/path or checkout-local `objective list` inventory for selection, recommends `objective list --minimal --format md`, and uses `objective list --names` for machine-readable slug extraction.
- `skills/objective-create/SKILL.md` uses `objective list --minimal --status all --format md`, active/archived directory collision checks, and `objective exec read-objective <slug> --format md` for existing-record facts.
- `skills/objective-update/SKILL.md`, `objective-next`, and `objective-close` rely on `objective list --minimal --format md` and `objective exec read-objective <slug> --format md` for deterministic read mechanics while editing Markdown directly.
- `skills/objective-stack-impl/SKILL.md` uses `objective list --minimal --format md` and requires `objective exec runner-subagent-usage --format md <session-file>...` for final runner telemetry digest.
- The skill family explicitly forbids Branch Memory storage, hidden state, YAML/frontmatter, UUID registries, and task-database semantics.

Pi/TypeScript consumers:

- `ts/packages/pi-extension-runtime/src/objective-selection.ts` executes `objective list --minimal --format json`, parses the envelope, checks changed Objective paths with `git diff --name-status -M <trunk>...HEAD -- .asdl/objectives` plus dirty status, and presents explicit Objective selection.
- `ts/packages/pi-extension-runtime/src/objective-list.ts` parses current Objective list JSON and maps snake_case fields to TS objects.
- `ts/packages/pi-extensions/src/objective.ts` registers `/objective:list`, `/objective:create`, `/objective:next`, and `/objective:update` surfaces. It shells out to standalone `objective list` and `objective exec list-candidates --format json`, rejects unsupported `--format`/`--json-schema` for the Pi chat mirror, and records surface parity notes for Objective commands.
- `ts/packages/ccc/src/cmux/objective-sidebar.ts` shells out to `objective list --minimal --format json` for sidebar choices and `objective exec read-objective <slug> --format json` for validation. It also knows `.asdl/objectives` and `.asdl/objective-archive` path roots.
- `skills/ccc-available-work/SKILL.md` uses `objective list --format json` and `objective exec read-objective <slug> --format md` as part of read-only continuation recommendations.

No active grep evidence found skill/TS consumers shelling out to `asdl objective`, but the plugin smoke test remains a current repo contract.

## Git and Filesystem Behavior

- `packages/asdl-objectives/src/asdl_objectives/context.py` builds real CLI context through `build_git_context(Path.cwd())`; if git or trunk discovery is unavailable, commands return Clinkr failures instead of late crashes. Trunk resolution failure message is `Cannot resolve trunk branch (origin/HEAD, main, or master).`
- Objective discovery is checkout-local and filesystem-backed. Active discovery lists direct child directories under `.asdl/objectives` in sorted slug order.
- Archive root exclusion is a hard contract: `.asdl/objective-archive/<slug>` is never returned by active `objective list`, `objective exec list-candidates`, or `objective exec read-objective`.
- Latest update attribution uses `ctx.git.path_last_touched("HEAD", ".asdl/objectives/<slug>")`; dirty marker uses `ctx.git.has_uncommitted_changes_under(repo_root, ".asdl/objectives/<slug>")`.
- Default list branch attribution uses `build_objective_branch_attribution(...)` to find local branches with Objective path touches since trunk and can truncate older branches.
- Archive/unarchive uses filesystem rename through `FilesystemObjectiveStorage.move_record()` after LBYL collision/source checks; it creates the destination parent but refuses destination collisions.

## Existing Test Coverage and Golden Candidates

Scenario tests to preserve or port first:

- `packages/asdl-objectives/tests/scenario/test_objective_cli.py` covers top-level help/version/runtime visibility, absence of `objective gt`, archive/unarchive JSON and human output, collision/missing-source/invalid-slug behavior, hidden exec visibility, `list-candidates`, `read-objective`, and `runner-subagent-usage` JSON/Markdown/negative behavior.
- `packages/asdl-objectives/tests/scenario/test_objective_list_cli.py` covers list help, open/closed filtering, archive-root omission, untracked active directory inclusion, names-only output, dirty-marker behavior, removed flag/status rejection, branch attribution JSON/human/Markdown, branch ordering, unavailable contexts, and git failure surfacing.
- `tests/scenario/test_plugins.py::test_objective_plugin_integration` is the current plugin smoke test and the compatibility gate to delete or replace if `asdl objective` is retired.

Unit test candidates for Vitest/fake ports:

- `packages/asdl-objectives/tests/unit/test_objective_storage.py`: slug/path helpers, active/archive roots, direct child inventory, closed marker detection, update-file sorting, raw Markdown reads, move paths, and active path slug extraction.
- `test_list.py`, `test_list_render.py`, `test_list_status.py`, and `test_list_updates.py`: list result construction, status filtering, Markdown/human row rendering, dirty-marker formatting, latest-touch selection, and timestamp parsing.
- `test_runner_subagent_usage.py`: runner subagent JSONL parsing, status/error cases, token/cost aggregation, and model identity extraction.

Gaps for future parity fixtures:

- Exact help bytes may become `@asdl/clinkr`/commander-shaped and should be classified before freezing.
- Cross-language parity for `read-objective` Markdown and `runner-subagent-usage` Markdown would de-risk skill-visible output.
- Consumer-level TS tests already assert JSON parsing and command invocations; future port work should keep them green or update them with explicit compatibility decisions.

## Distribution and Cutover Assumptions

- Current Python install model: root `justfile` `install-tools` installs `packages/asdl-objectives` as an editable uv tool. The comment still says slot and objective are editable uv tools, while `brmem`, `handoff`, and `areg` use TypeScript source shims.
- Current workspace model: root `pyproject.toml` includes `packages/asdl-objectives` in uv workspace members/sources/dev dependencies, Ruff source paths, known first-party imports, ty include paths, and pytest testpaths. `packages/asdl-objectives/pyproject.toml` provides both standalone script and `asdl.plugins` entry point.
- Future default: create `ts/packages/objective` with Node ESM, `@asdl/clinkr`, `@asdl/core`, Zod, package-local contexts/gateways, and a source bin such as `./src/cli.ts`, mirroring `ts/packages/brmem`, `ts/packages/handoff`, and `ts/packages/areg` manifests.
- `ts/pnpm-workspace.yaml` already includes `packages/*`; adding `ts/packages/objective` should make it part of the TS workspace without changing that file unless conventions change.
- Future `just install-objective` / `install-tools` should likely install a TypeScript source shim and remove stale Python console scripts, following `handoff`/`areg` lessons. Do not delete Python until callers/docs/tests/install recipes no longer depend on it.
- Rollback/reference evidence should be recorded immediately before Python deletion. Private in-repo packages have used a pre-deletion commit hash; external PyPI rollback was used for `pr-address`.

## Incidental Python Details / Accepted Divergence Candidates

- Python module boundaries (`archive.py`, `list.py`, `list_render.py`, `objective_storage.py`, `exec/*`) need not be mirrored module-for-module in TypeScript.
- Click/Clinkr help wrapping, exact option ordering, and parser error bytes may diverge if the Objective records an accepted `@asdl/clinkr` behavior and tests assert the stable contract instead of accidental bytes.
- Python `ClinkrModel`/Pydantic internals are implementation detail; durable behavior is the envelope/schema visible to consumers.
- Current snake_case JSON fields are durable while TS consumers parse them. A camelCase migration would be migration-debt and needs explicit compatibility planning.
- The `asdl objective` plugin path is a compatibility question, not an assumed durable end state. Grep evidence points toward standalone-only callers, but tests currently preserve the plugin.
- Branch attribution internals may be package-local at first. Do not move git touch/branch attribution into `@asdl/core` solely because Objective needs it.

## Initial Slice Recommendation

After this setup Objective, start implementation with a read-only, contract-heavy slice rather than broad package scaffolding plus many operations at once:

1. Create `ts/packages/objective` with the standalone `objective` CLI shell, Clinkr envelope support, package-local filesystem storage gateway/fake, and `objective exec read-objective` JSON/Markdown parity.
2. Port `objective list --minimal --format json` next because Pi/CCC selection consumers depend on it and it proves active-root inventory, status filtering, latest update facts, and dirty marker boundaries.
3. Add `list-candidates`, archive/unarchive, full list branch attribution, and `runner-subagent-usage` in vertical slices with focused parity tests.
4. Decide `asdl objective` plugin retirement and distribution only after standalone parity and consumer grep evidence are current.

Do not implement this slice in the setup branch that created this inventory.
