# areg TypeScript Port Contract Inventory

## Purpose

This inventory classifies the current Python `areg` package behavior before the TypeScript port begins. The TypeScript implementation should preserve the durable command, file-layout, JSON, and safety contracts below while freely replacing incidental Python, Click, and module-structure details.

Evidence inspected for this inventory:

- Runtime and command registration: `packages/areg/src/areg/cli.py`, `packages/areg/pyproject.toml`.
- Hidden agent helpers: `packages/areg/src/areg/skillx.py`, `packages/areg/src/areg/gateways/gh/*`, `packages/areg/src/areg/gateways/npx_skills/*`, `packages/areg/src/areg/gateways/skillx_workspace/*`, `packages/areg/tests/scenario/test_skillx_cli.py`, `packages/areg/tests/unit/test_skillx.py`.
- Project bootstrap: `packages/areg/src/areg/init_project.py`, `packages/areg/src/areg/file_plan.py`, `packages/areg/src/areg/project_agents.py`, `packages/areg/tests/scenario/test_init_project.py`.
- Skill validation: `packages/areg/src/areg/check/**`, `packages/areg/tests/integration/test_check.py`, `packages/areg/tests/unit/test_frontmatter.py`, `packages/areg/tests/unit/test_lockfile.py`, `packages/areg/tests/unit/test_pairing.py`.
- Curated skill update workaround: `packages/areg/src/areg/update_skills.py`, `packages/areg/tests/scenario/test_update_skills.py`.
- Command conversion: `packages/areg/src/areg/command.py`, `packages/areg/src/areg/command_conversion.py`, `packages/areg/src/areg/invoke_only.py`, `packages/areg/tests/scenario/test_command.py`.
- Public prose and consumers: `packages/areg/README.md`, `justfile`, `skills/skill-management/SKILL.md`, `skills/skillx/SKILL.md`, `docs/harness-skill-invocation.md`, `docs/skill-invocation-kinds.md`.

## Durable product identity

- The durable product surface is a standalone `areg` CLI. The current Python package exposes a console script `areg = "areg.cli:main"`; the TypeScript package should keep the command name `areg` unless a later explicit product decision changes it.
- The top-level visible command groups are `init`, `check`, `update-skills`, and `command`. The hidden `exec` group is intentionally invocable but hidden from top-level help.
- `areg` is not currently mounted as an `asdl` plugin. The TypeScript port should not add an `asdl areg` surface as part of parity.
- `uv run areg ...` is the current checkout-local invocation path. `packages/areg/README.md` still mentions future `uvx areg init`; that is a distribution expectation to revisit in the distribution roadmap row, not a reason to preserve Python packaging.

## Durable hidden `exec skillx` contracts

`areg exec skillx` is an agent-facing machine-readable surface. JSON shape and cleanup safety are durable; exact indentation and key order are only durable where tests or skills consume them as ordinary JSON, not bytes.

Accepted TypeScript divergence: the TypeScript hidden `exec skillx` helpers use normal Clinkr rendered-command behavior rather than the Python raw-JSON boundary. Machine callers must pass `--format json` and read the Clinkr envelope. The old success/failure payloads are preserved under envelope `data` for `ok(...)` and `negative(...)` exits where applicable; Clinkr precondition failures use the envelope `error_type`/`message` failure channel. Live caller docs remain intentionally unmigrated until the later TypeScript cutover/distribution row because Python `areg` remains the active reference path for current users.

### `areg exec skillx parse <input_text>`

Durable behavior:

- Always emits JSON and does not intentionally fail the process for parse failures.
- Success payload: `success: true`, `repo`, `skill`, and `format`.
- Failure payload: `success: false`, `error`.
- Accepted input formats:
  - GitHub URLs with at least `owner/repo`; if the path contains `skills/<name>`, the skill name is extracted.
  - `owner/repo --skill <name>` and `owner/repo -s <name>`.
  - Plain `owner/repo` or `owner/repo <skill-name>`.
- `format` values currently include `url`, `skill_flag`, `plain`, and `repo_only`.
- Empty input fails with `Empty input`; unparseable input fails with `Could not extract owner/repo from input: <repr>`.

Accepted incidental details:

- Python `urlparse` edge cases and exact regex implementation are incidental as long as the accepted formats above remain covered.
- Exact JSON indentation is incidental; preserve parseable JSON object shape.

### `areg exec skillx list --repo <owner/repo>`

Durable behavior:

- Requires `gh` to be available before attempting the list operation.
- Reads GitHub repo contents from `repos/<repo>/contents/skills` through the `gh api` boundary.
- Success payload: `success: true`, `repo`, `skills`, with skill names sorted.
- Failure payload: `success: false`, `error`, and optional `hint`.
- Missing repo/path reports `No skills directory found in <repo>` with hint `Check that the repo exists and has a skills/ directory`.
- Authentication errors report `Authentication error accessing <repo>` with a hint to check `gh auth status` for authentication issues.
- Other `gh` errors surface the gateway error string.
- Command exits nonzero when `success` is false, after emitting JSON.

Accepted incidental details:

- The current real adapter detects 404/401/403 by substring matching `gh` stderr. The TS adapter may use a safer process/gateway error classification if the observable JSON classification remains stable.

### `areg exec skillx fetch --repo <owner/repo> [--skill <name>]`

Durable behavior:

- Requires `npx` to be available before attempting the fetch operation.
- Creates a transient workspace whose directory basename starts with `skillx.`.
- Uses the external `npx skills add` boundary to install repo skills into that transient workspace for agent reading.
- Success payload for a selected skill includes `success: true`, `repo`, `skill`, `tmp_dir`, `skill_dir`, `skill_md`, and `files`.
- `files` is a sorted list of file paths relative to the fetched skill directory.
- If no skill name is supplied and the repo installs multiple skills, the command returns `success: true`, `tmp_dir`, `needs_selection: true`, and `available_skills`; selection-specific fields such as `skill`, `skill_dir`, `skill_md`, and `files` are present with null values. The caller should ask the user which skill to use and later clean up the returned temp directory.
- If installation produces no skills, cannot find the requested installed skill, or the transient workspace is malformed, the command emits `success: false`, `error`, `tmp_dir: null` and exits nonzero.
- If a requested skill is absent after install, the transient workspace is removed before returning the error.

Accepted incidental details:

- Fake tests use `/tmp/skillx.fake-1`; that fake path is not a product contract.
- The internal `SkillxWorkspaceInstaller` class shape is incidental, but the gateway seam itself is durable: tests must be able to fake transient installs without live `npx` calls.

### `areg exec skillx cleanup --dir <tmp_dir>`

Durable behavior:

- Success payload: `success: true`, `removed`.
- Failure payload: `success: false`, `error`; command exits nonzero.
- Cleanup refuses to remove paths whose basename does not start with `skillx.`.
- Cleanup refuses symlinks, missing paths, non-directories, and paths that resolve outside the system temp directory.
- Cleanup removes the directory recursively only after those checks pass.

Accepted incidental details:

- Error text may use TypeScript-native path rendering if the refusal reason and safety class remain clear; tests should assert safety behavior more than exact Python repr bytes.

## Durable `areg init` contracts

`areg init [TARGET] [--agent AGENT ...] [--yes] [--no-append]` initializes an existing Git repository root for areg skill workflows.

Durable behavior:

- Default target is `.`. The target must exist, resolve to a directory, and be exactly the Git worktree root. A subdirectory of a worktree is rejected with guidance to run at the root.
- `npx` is required before initialization.
- `--yes` and `--no-append` are mutually exclusive.
- Agent resolution precedence is:
  1. explicit repeatable `--agent` values;
  2. `asdl.toml` `[areg].agents` through shared project-config parsing;
  3. legacy `areg.json` field `agents` as a non-empty string list;
  4. default `codex`, `claude-code`.
- `asdl.toml` is the durable config target. `areg init` creates or updates `[areg] agents = [...]`, preserving other TOML sections. Existing legacy `areg.json` is read for migration but is not deleted or rewritten.
- Bootstrap install uses `npx skills add dagster-io/asdl-tools --skill skill-management skillx --agent <agents...> -y` through the gateway. The exact shell command can be represented by a gateway, but the repo, skills, agents, cwd, and yes behavior are durable.
- `AGENTS.md` receives an areg-managed block bounded by `<!-- areg:skills:start -->` and `<!-- areg:skills:end -->`.
- `CLAUDE.md` receives an areg-managed block bounded by `<!-- areg:claude-skills:start -->` and `<!-- areg:claude-skills:end -->`.
- New `CLAUDE.md` or appended Claude blocks include `@AGENTS.md` unless existing non-managed prose already contains that include.
- Existing prose files without managed blocks prompt before appending unless `--yes` approves or `--no-append` skips.
- Existing managed blocks prompt before replacement unless `--yes` approves or `--no-append` skips.
- Malformed managed markers are rejected before external install.
- Existing `.claude/settings.local.json` is preserved. Missing settings are created from the bundled `settings.local.json` template.
- `areg init` does not create `.gitignore`, project language/package files, or `areg.json`.
- On success, human output reports bootstrap install, initialized path, installed bootstrap skills, and review/commit guidance.

Safety contracts:

- Before external install, `areg init` rejects symlink or wrong-type `AGENTS.md`, `CLAUDE.md`, `asdl.toml`, `.claude`, and `.claude/settings.local.json` targets that it would manage.
- Text writes are planned before external install and applied after install. The post-install application revalidates parents and targets so a malicious or surprising `npx` side effect cannot redirect writes through symlinks.
- Writes and deletes must stay under the selected project root.

Accepted incidental details:

- Exact Click prompt wording and help wrapping are incidental unless a test explicitly protects a safety message. Preserve the decision points and refusal classes.
- The Python order “install bootstrap skills, then apply planned text files” is current behavior. It is durable only insofar as tests expect no local file mutation before preflight failures and revalidation after external install. A TS implementation may choose a more atomic order if it preserves or improves those safety guarantees and records the divergence.

## Durable `areg check` contracts

`areg check [--path PATH]` validates skill layout and project skill-management conventions for a project with `skills-lock.json`.

Durable behavior:

- Default path is `.`. Missing or malformed `skills-lock.json` is a command error.
- Valid lockfile root shape is JSON object `{ "version": 1, "skills": { ... } }`.
- Supported `sourceType` values are `local`, `github`, `git`, and `gitlab`.
- Each skill lock entry requires string `source`, string `sourceType`, string `computedHash`, and optional string `skillPath`.
- `computedHash` must be a 64-character lowercase SHA-256 hex string; placeholder `PENDING_REGEN` is rejected with specific guidance to regenerate or normalize the lockfile.
- Success output is `All skills OK.` with exit code 0.
- Failure output groups issues by skill/key and exits nonzero.

Local skill layout contracts:

- A local skill lockfile source must be exactly `skills/<name>`.
- `skills/<name>/` must exist and be a real directory, not a symlink.
- `.agents/skills/<name>` must be a symlink to `../../skills/<name>`.
- `.claude/skills/<name>` must be a symlink to `../../.agents/skills/<name>`.
- Local skill `SKILL.md` is read from `skills/<name>/SKILL.md`.

Remote skill layout contracts for `github`, `git`, and `gitlab` source types:

- `.agents/skills/<name>/` must exist as a real vendored directory, not a symlink.
- `.claude/skills/<name>` must be a symlink to `../../.agents/skills/<name>`.
- `skills/<name>/` must not exist.
- Remote skill `SKILL.md` is read from `.agents/skills/<name>/SKILL.md`.

Frontmatter and invoke-only contracts:

- `SKILL.md` must have simple YAML-like frontmatter delimited by `---`.
- `description` is optional but, when present, must be at most 1024 characters.
- `disable-model-invocation: true` marks a local skill as invoke-only / command-backed.
- Invoke-only local skills must have `skills/<name>/agents/openai.yaml` with Codex policy content `policy:\n  allow_implicit_invocation: false\n`.
- A Codex sidecar without the SKILL.md flag is inconsistent.
- Any skill with invoke-only flag or sidecar must be excluded from Pi through `.pi/settings.json` entry `-skills/<name>`.
- Pi exclusions require a verified replacement command.

Orphan and pairing contracts:

- Extra directories in `skills/` or `.agents/skills/` that are not in the lockfile are errors unless listed in `.git/info/exclude` under `.agents/skills/<name>` or `.claude/skills/<name>`.
- A lockfile entry with no corresponding `skills/`, `.agents/skills/`, or `.claude/skills/` path is dangling and is an error.
- Directories containing `AGENTS.md` or `CLAUDE.md` should have both peer files, and `CLAUDE.md` should include `@AGENTS.md`.
- Pairing traversal prunes `.venv`, `.git`, `node_modules`, `.agents/skills`, `.claude/skills`, and areg’s own bundled templates.

Accepted incidental details:

- Internal `IssueKind` enum names are not a public JSON surface and need not be preserved unless tests are ported around them as internal unit tests.
- The simple frontmatter parser is a compatibility behavior, not a mandate to use a YAML parser. A TS parser should preserve accepted existing SKILL.md shapes and the 1024-character description limit.
- Exact grouping blank lines and Click-rendered error prefixes are incidental; scenario tests should preserve user-legible issue messages and exit status.

## Durable `areg update-skills` contracts

`areg update-skills [--path PATH] [--skill NAME ...] [--source OWNER/REPO ...] [--agent AGENT ...] [--dry-run]` is a curated lockfile-preserving workaround for upstream `npx skills update` behavior.

Durable behavior:

- Reads `skills-lock.json` from `--path` (default `.`) using the same lockfile parser as `areg check`.
- Considers only `sourceType: "github"` entries. Local, git, and gitlab entries are not updated by this command.
- `--skill` filters by skill name and errors if any requested skill is not found among GitHub-sourced lockfile entries.
- `--source` filters by exact lockfile source string.
- If no GitHub-sourced entries match, prints `No github-sourced skills match. Nothing to update.` and exits 0.
- Agent resolution uses the same precedence as `areg init`: explicit `--agent`, then `asdl.toml`, then legacy `areg.json`, then defaults.
- `--dry-run` prints deterministic planned updates, does not require `npx`, and does not call the gateway.
- Non-dry-run requires `npx`, then calls `npx skills add <source> --skill <name> --agent <agents...> -y` once per selected skill in sorted skill-name order.
- Individual failures are reported next to the skill, aggregate failure count is raised at the end, and the command exits nonzero if any update fails.

Accepted incidental details:

- The workaround module and command should be deleted only when upstream behavior is explicitly judged safe and docs/skills are updated. Until then, preserving this command is durable.
- Exact progress-line spacing is incidental, but sorted deterministic output and dry-run/non-dry-run distinction are durable.

## Durable `areg command convert|revert|list` contracts

The current durable surface is the legacy `areg command` group. `docs/skill-invocation-kinds.md` describes future `areg skill kind` commands, but no such command group is registered in `packages/areg/src/areg/cli.py`; those future commands are not current-port parity scope unless separately added before or during this Objective.

### Shared command-selection contracts

- `--path` defaults to `.` and may point to a project directory or subdirectory; commands resolve the Git worktree root through the environment gateway.
- Skill arguments may be local skill names, `skills/<name>`, `skills/<name>/SKILL.md`, or symlink paths through `.agents/skills/<name>` and `.claude/skills/<name>` that resolve back to a canonical local skill.
- Commands edit only local skills under `skills/<name>/`. Real vendored `.agents/skills/<name>` directories are refused.
- Symlinked canonical `skills/<name>` directories and symlinked canonical `SKILL.md` files are refused.
- Missing skills, wrong-type paths, and paths resolving outside `skills/<name>` are refused before mutation.

### `areg command convert`

Durable behavior:

- Synopsis: `areg command convert [--path PATH] [--dry-run] SKILL...`.
- Emits `Converting <skill>...` for each selected skill.
- Requires a verified Pi replacement before planning mutation. Verification succeeds through a specialized mapping for known skills or through the generic replacement layer (`.pi/extensions/backing-skill-commands.ts` plus `ts/packages/pi-extensions/src/backing-skill-commands.ts`).
- Inserts or normalizes `disable-model-invocation: true` in SKILL.md frontmatter immediately after `name:` while preserving other frontmatter and body content.
- Writes `skills/<name>/agents/openai.yaml` with `policy:\n  allow_implicit_invocation: false\n`.
- Adds `-skills/<name>` to `.pi/settings.json` `skills` array, preserving other JSON object keys and existing skills entries.
- Is idempotent when artifacts are already current.
- `--dry-run` reports planned writes/skips and makes no filesystem changes.
- Malformed `.pi/settings.json`, non-object settings, non-string `skills` entries, symlinks, or settings resolving outside the project are refused before mutating SKILL.md or sidecar files.

### `areg command revert`

Durable behavior:

- Synopsis: `areg command revert [--path PATH] [--dry-run] SKILL...`.
- Emits `Reverting <skill>...` for each selected skill.
- Removes `disable-model-invocation` frontmatter entries.
- Deletes `skills/<name>/agents/openai.yaml` when present and removes the now-empty `agents/` directory.
- Removes exactly `-skills/<name>` from `.pi/settings.json` while preserving other entries and keys.
- Is idempotent when artifacts are already absent.
- `--dry-run` reports planned writes/deletes/skips and makes no filesystem changes.

### `areg command list`

Durable behavior:

- Synopsis: `areg command list [--path PATH]`.
- Lists only local skills discovered under `skills/*/SKILL.md`, sorted by skill name.
- If no local skills exist, prints `No local skills found.`.
- Row format is tab-separated: `<skill>\t<invoke-status>\t<pi-visible|pi-excluded>\t<replacement-status>`.
- Invoke statuses are `normal`, `invoke-only`, `inconsistent: flag set but agents/openai.yaml missing`, and `inconsistent: agents/openai.yaml present but flag unset`.
- Replacement statuses are `replacement-missing`, `replacement-verified`, `replacement-verified:<surface>`, and `replacement-missing:<surface>`.

Accepted incidental details:

- `KNOWN_PI_COMMAND_NAMESPACES` and `SPECIALIZED_SKILL_REPLACEMENTS` are product configuration, not Python architecture. Preserve the currently accepted mappings or move them to TS configuration with tests.
- The current derivation may produce surfaces that differ from specialized mappings for a few skills; specialized mapping wins for verification. Preserve externally visible verification outcomes, not every helper’s intermediate value.

## Durable project file and config contracts

- Canonical local skills live in `skills/<name>/`.
- `.agents/skills/<name>` is the universal installed-agent path. For local skills it should symlink to `../../skills/<name>`; for GitHub/git/gitlab skills it should be a real vendored directory.
- `.claude/skills/<name>` should symlink to `../../.agents/skills/<name>`.
- `skills-lock.json` is the durable lockfile name and uses `version: 1` plus a `skills` object keyed by skill name.
- `asdl.toml` `[areg].agents` is the durable current config for target agents.
- Legacy `areg.json` is still read for `agents` when `asdl.toml` has no `[areg].agents`; it is not written by current `areg init` and should not become the preferred TS config.
- Managed instruction blocks in `AGENTS.md` and `CLAUDE.md` are durable by marker names, not by Python string constants.
- `.pi/settings.json` `skills` entries of the form `-skills/<name>` are the current Pi exclusion mechanism for command-backed skills.

## Durable external boundaries and gateways

The TypeScript port should preserve fake-driven boundaries for these effects:

- Host tool checks for `gh` and `npx`.
- Git root discovery via `git rev-parse --show-toplevel` semantics.
- GitHub skill listing through the `gh api repos/<repo>/contents/skills --jq .[].name` boundary or an equivalent gateway with the same success/error classes.
- `npx skills add` for bootstrap installs, persistent updates, and transient skillx workspace installs.
- Transient skillx workspace creation and cleanup.
- Filesystem planning/mutation for project config, managed prose blocks, settings files, local skill frontmatter, sidecars, and deletion of sidecars/empty dirs.

Do not collapse these boundaries into unmocked direct process/filesystem calls in TS tests.

## Accepted TypeScript divergences before implementation

These divergences are accepted up front and do not need separate Objective approval if tests record them deliberately:

- Python package/module/class layout is incidental. Do not mirror `areg.check.*` or gateway class names unless useful in TypeScript.
- Click help wrapping, `Usage:` casing, and parser-generated error byte strings are incidental except where docs or tests assert semantic behavior.
- JSON key order and indentation are incidental; object fields and success/error/exit semantics are durable.
- Internal dataclass, enum, and exception names are incidental.
- TypeScript may use package-local functional modules and injected gateway objects instead of Python ABC classes.
- TypeScript may improve preflight/application ordering for `areg init` if it preserves no-mutation-before-local-validation-failure and post-external-install symlink revalidation.
- TypeScript may replace brittle `gh` stderr substring parsing with structured process-result classification if user-facing error classes are preserved.

## Open compatibility questions for later roadmap rows

- Distribution is unresolved. The current docs mention both checkout-local `uv run areg` and future `uvx areg`; the TypeScript port must make a consumer-backed distribution/install decision before cutover.
- Legacy `areg.json` is still a read fallback. The TS port should preserve it for parity unless a later explicit update records a retirement path.
- `docs/skill-invocation-kinds.md` documents future `areg skill kind` commands that are not implemented by the current Python CLI. The TS port should not accidentally turn that aspirational design into required parity for this Objective’s scoped `areg command` row.
- Reusable TypeScript seams for skill-lock parsing, managed blocks, or project config should remain package-local until a second consumer proves they belong in shared packages.
