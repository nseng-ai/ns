# Pup Skill-Management Research Report

Provenance: public upstream repository `https://github.com/DataDog/pup`, inspected from raw GitHub `main` on 2026-06-15. Citations in this report use repo-relative paths such as `DataDog/pup:src/skills.rs`; no local checkout paths are required.

## Executive Summary

Pup's skill-management design is attractive because it is deliberately boring. It does not start with a marketplace, package resolver, or dynamic plugin system. Instead, Pup embeds a static resource catalog into the CLI binary, stores coding-agent platform filesystem conventions in a data table, and exposes one obvious command family:

```bash
pup skills list
pup skills install [platform]
pup skills path [platform]
```

The command family installs three related resource types:

- `skill`: a Markdown skill installed as `SKILL.md` in a harness-specific skills directory;
- `agent`: a domain subagent, installed as native Claude Code agent Markdown where available and as `SKILL.md` fallback elsewhere;
- `extension`: a multi-file bundle for a specific coding-agent platform, currently exemplified by the Pi `dd-pup-pi` extension.

The design is worth borrowing for ASDL because it separates four concerns cleanly:

1. **Resource catalog**: what bundled assistant resources exist.
2. **Platform spec table**: where each harness expects skills, agents, and extensions.
3. **Install planning**: what paths/content would be written for a resource/platform/scope combination.
4. **CLI operations**: list, path, and install behavior with useful errors.

For ASDL, the first adaptation should target core `asdl` and `sdl` CLI resources before broader SDL extension reuse. That means a reusable subsystem should ship with enough catalog/path/install machinery for both CLIs to list and install bundled resources, while leaving remote catalogs, update resolution, and marketplace behavior out of scope.

## Source Files Consulted

Key files:

- `DataDog/pup:README.md` — public command examples, agent-mode positioning, and user-facing skill install guidance.
- `DataDog/pup:src/main.rs` — top-level `Skills` command definition, `SkillsActions`, agent-mode schema/help behavior, and dispatch.
- `DataDog/pup:src/skills.rs` — static resource catalog, platform specs, platform alias normalization, path resolution, content formatting, and tests.
- `DataDog/pup:src/commands/skills.rs` — `list`, `install`, and `path` command implementations.
- `DataDog/pup:docs/LLM_GUIDE.md` — broader agent-operability posture.
- `DataDog/pup:docs/EXTENSIONS.md` — extension model context.
- `DataDog/pup:skills/extensions/dd-pup-pi/index.ts` — Pi extension implementation registered as an installable multi-file bundle.
- `DataDog/pup:skills/extensions/dd-pup-pi/README.md` — user-facing Pi extension install and behavior notes.

## Command Surface

Pup exposes `skills` as a top-level command group in `DataDog/pup:src/main.rs` with this description:

> Manage agent skills, subagents, and extensions for AI coding assistants

The documented command surface includes:

```bash
pup skills list
pup skills list --type=skill
pup skills list --type=agent
pup skills install
pup skills install claude
pup skills install cursor
pup skills install codex
pup skills install opencode
pup skills install pi
pup skills install all
pup skills install claude --project
pup skills install claude --name dd-monitors
pup skills install --type=agent claude
pup skills path
pup skills path pi
```

`DataDog/pup:README.md` emphasizes that Pup ships skills and domain agents embedded in the binary and that `pup skills install` installs them for the auto-detected platform by default. Explicit platform arguments and `all` are supported. `--project` switches from user-global destination directories to project-local directories.

`DataDog/pup:src/main.rs` defines three `SkillsActions`:

- `List { entry_type }` with `--type` filter;
- `Install { platform, name, dir, entry_type, project }` with optional platform positional, `--name`, `--dir`, `--type`, and `--project`;
- `Path { platform, project }` with optional platform positional and `--project`.

The UX lesson for ASDL is that the first command family should be similarly small. A sprawling taxonomy is unnecessary. ASDL likely needs only list/path/plan/install at first; `plan` can be explicit or folded into install dry-run behavior depending on local CLI conventions.

## Static Resource Catalog Model

`DataDog/pup:src/skills.rs` defines `SkillEntry` as the single static catalog entry type:

```rust
pub struct SkillEntry {
    pub name: &'static str,
    pub description: &'static str,
    pub entry_type: &'static str,
    pub content: &'static str,
    pub platform: &'static str,
    pub files: &'static [(&'static str, &'static str)],
}
```

Important semantics:

- `entry_type` is one of `skill`, `agent`, or `extension`.
- `content` holds the Markdown body for skills and agents.
- `platform` is empty for skills/agents and names the target platform for extension bundles.
- `files` is empty for skills/agents and contains `(relative_path, contents)` tuples for extension bundles.

Pup embeds skill and agent Markdown with `include_str!`, for example `include_str!("../skills/dd-pup/SKILL.md")` and `include_str!("../agents/agentless-scanning.md")`. That makes the catalog compile-time explicit and testable. The CLI can list resources without scanning user directories, resolving package metadata, or executing plugins.

The static catalog contains:

- 11 Datadog-focused skills such as `dd-pup`, `dd-monitors`, `dd-logs`, `dd-apm`, `dd-debugger`, `dd-docs`, and `dd-code-generation`.
- A large set of domain agents sourced from `agents/*.md`.
- One Pi extension bundle, `dd-pup-pi`.

`DataDog/pup:src/skills.rs` also includes structural tests for catalog quality: valid names, non-empty descriptions, valid entry types, required content/files, no duplicates, and expected counts. This is a strong precedent for ASDL: resource catalogs should be validated as ordinary unit-test data, not discovered accidentally at runtime.

## Multi-File Extension Bundles

Pup's extension support is just another catalog entry kind. The `dd-pup-pi` bundle is registered in `DataDog/pup:src/skills.rs` as an `extension` entry with `platform: "pi"` and a static file list:

```rust
static DD_PUP_PI_FILES: &[(&str, &str)] = &[
    ("index.ts", include_str!("../skills/extensions/dd-pup-pi/index.ts")),
    ("package.json", include_str!("../skills/extensions/dd-pup-pi/package.json")),
    ("README.md", include_str!("../skills/extensions/dd-pup-pi/README.md")),
];
```

The extension installs under the platform's extensions directory as:

```text
<extensions-dir>/<entry-name>/<relative-bundled-file-path>
```

This is important for ASDL because Pi extensions are not just Markdown prompts. A reusable resource subsystem should be able to represent multi-file bundles even if the first ASDL slice chooses to install only skills. Otherwise the package will need an avoidable redesign as soon as `sdl` or ASDL wants to ship a Pi command/tool bundle.

## Platform Spec Table

`DataDog/pup:src/skills.rs` defines platform install behavior with `PlatformSpec`:

```rust
pub struct PlatformSpec {
    pub name: &'static str,
    pub aliases: &'static [&'static str],
    pub project_skills: &'static str,
    pub user_skills: &'static str,
    pub project_agents: &'static str,
    pub user_agents: &'static str,
    pub project_extensions: &'static str,
    pub user_extensions: &'static str,
    pub uses_agent_md: bool,
}
```

Empty path strings mean a capability is not supported. Empty agent paths have a different meaning: agents share the skills directory unless `uses_agent_md` indicates native Claude Code agent Markdown.

Observed platform table:

| Platform      | Aliases  | Project skills     | User skills               | Project agents   | User agents      | Project extensions | User extensions        | Agent format                        |
| ------------- | -------- | ------------------ | ------------------------- | ---------------- | ---------------- | ------------------ | ---------------------- | ----------------------------------- |
| `claude-code` | `claude` | `.claude/skills`   | `.claude/skills`          | `.claude/agents` | `.claude/agents` | none               | none                   | native agent `.md`                  |
| `cursor`      | none     | `.cursor/skills`   | `.cursor/skills`          | shares skills    | shares skills    | none               | none                   | `SKILL.md` fallback                 |
| `codex`       | none     | `.codex/skills`    | `.codex/skills`           | shares skills    | shares skills    | none               | none                   | `SKILL.md` fallback                 |
| `opencode`    | none     | `.opencode/skills` | `.config/opencode/skills` | shares skills    | shares skills    | none               | none                   | `SKILL.md` fallback                 |
| `windsurf`    | none     | `.windsurf/skills` | `.windsurf/skills`        | shares skills    | shares skills    | none               | none                   | `SKILL.md` fallback                 |
| `gemini-code` | `gemini` | `.gemini/skills`   | `.gemini/skills`          | shares skills    | shares skills    | none               | none                   | `SKILL.md` fallback                 |
| `pi`          | `pi-dev` | `.pi/skills`       | `.pi/agent/skills`        | shares skills    | shares skills    | `.pi/extensions`   | `.pi/agent/extensions` | `SKILL.md` fallback plus extensions |

The ASDL design should copy the table-driven shape. Harness path conventions should not be scattered through CLI command handlers or per-package resource code.

## Platform Resolution and Scope Behavior

Pup supports canonical platform names, aliases, `all`, and auto-detection:

- `lookup_platform(name)` accepts canonical names and aliases.
- `resolve_platform_name(input)` normalizes aliases and falls back to environment detection when no input is provided.
- `resolve_platform_list(input)` expands `all` to every supported platform.
- `DataDog/pup:src/commands/skills.rs` wraps that with validation so unknown platforms produce useful errors.

Install scope defaults to user-global. `--project` flips to project-local. Project root discovery walks up to the nearest `.git` and falls back to current working directory when none is found.

For ASDL, defaults need careful product choice. User-global installs are convenient but surprising; project-local installs are safer but less useful when the user expects harness resources globally. Pup mitigates this with `pup skills path` and clear output. ASDL should include path/plan preview early, especially because it may install into `.pi/agent`, `.claude`, `.codex`, or project-local directories.

## Install Semantics

Pup's install behavior in `DataDog/pup:src/skills.rs` and `DataDog/pup:src/commands/skills.rs` is deterministic:

### Skills

Skills install to:

```text
<skills-dir>/<name>/SKILL.md
```

If the source content lacks `name:` frontmatter, Pup adds it. If frontmatter exists and already has `name:`, Pup preserves it.

### Agents

Agents install differently by platform:

- Claude Code native subagents install to:

```text
<agents-dir>/<name>.md
```

- Other platforms fall back to:

```text
<skills-dir>/<name>/SKILL.md
```

With `--dir`, Pup writes everything as:

```text
<override-dir>/<name>/SKILL.md
```

### Extensions

Extensions are platform-specific. A Pi-only extension installs only for `pi`, even if `--dir` is supplied. It expands to one write per bundled file:

```text
<extensions-dir>/<entry-name>/<relative-path>
```

### Deduplication and Conflicts

`DataDog/pup:src/commands/skills.rs` builds a pending writes map keyed by destination path. If multiple selected platforms produce identical content for the same destination, the write is deduplicated. If different content would be written to the same path, Pup errors instead of overwriting unpredictably.

### Filter Errors

If `--name` or `--type` filters match no actual install targets, Pup errors. This avoids typo-driven silent success. For extension-only/platform mismatch cases, Pup attempts to provide actionable messages.

### `all` Behavior

When `all` is selected, Pup intentionally includes extension bundles even when a `--name` or `--type` filter would otherwise select only skills. The rationale in code is that `all` means the "full experience" on every platform.

ASDL should probably start stricter than Pup here unless a similar product rule is desired. Installing more than the user filtered can be helpful but also surprising. If ASDL borrows this behavior, it should be explicitly documented and covered by tests.

## List and Path Behavior

`pup skills list` returns each available entry with:

- `name`
- `type`
- `description`

For extension entries, it also includes:

- `platform`
- `files`

`pup skills path` prints the destination directories for skills, agents, and extensions for a chosen platform and scope. It suppresses redundant agent paths when agents share the skills directory.

ASDL should preserve both operations. `list` answers "what can this CLI install?" while `path` answers "where would this go?" These are different questions and both are useful before mutation.

## Agent-Friendliness Beyond Skill Installation

Pup's skill-management command is part of a broader agent-oriented CLI posture visible in `DataDog/pup:README.md` and `DataDog/pup:src/main.rs`:

- Agent mode auto-detects common coding-agent environments including Claude Code, Cursor, Codex, Aider, Cline, Windsurf, GitHub Copilot, Amazon Q, Gemini Code Assist, Sourcegraph Cody, and Pi.
- In agent mode, `--help` returns structured JSON schema rather than human help text.
- `pup agent schema` exposes a JSON command tree.
- `pup agent guide` provides operational guidance.
- Agent mode auto-approves confirmation prompts.
- The schema includes best practices, anti-patterns, query syntax, script-authoring guidance, and read-only/write classification.

The ASDL implication is that resource installation should not be treated as cosmetic. Assistant resources, command schemas, structured outputs, and harness integrations are all parts of the same agent-operability product. The initial ASDL subsystem can still be small, but it should be designed as CLI infrastructure, not as a one-off file copier.

## Pi Extension Bundle Details

Pup ships `dd-pup-pi` as an installable Pi extension bundle. `DataDog/pup:skills/extensions/dd-pup-pi/README.md` documents installation:

```bash
pup skills install pi
pup skills install pi --project
```

The first command defaults to user-global `~/.pi/agent/extensions`; the second installs project-local under `<repo>/.pi/extensions/dd-pup-pi`.

The extension registers tools documented in `DataDog/pup:skills/extensions/dd-pup-pi/README.md` and implemented in `DataDog/pup:skills/extensions/dd-pup-pi/index.ts`:

- `pup_run`
- `pup_logs_search`
- `pup_logs_aggregate`
- `pup_metrics_query`
- `pup_traces_search`
- `pup_monitors_list`
- `pup_apm_services`
- `pup_auth_status`

It also registers slash commands:

- `/pup <subcommand…>`
- `/pup-auth`

Notable implementation details in `index.ts`:

- `DD_PUP_BIN` can override the `pup` binary path.
- JSON output is auto-injected unless the caller already passed an output flag.
- Tool output is truncated around 24 KB to keep context bounded.
- Parsed JSON is attached in tool result details.
- The extension detects likely 401/403/auth failures, runs `pup auth refresh` once, and retries.
- A status widget shows Datadog site and token expiry when available.
- Tool descriptions include operational guardrails such as APM trace durations being nanoseconds.

The ASDL lesson is that the same resource installer can handle both passive Markdown resources and active runtime extension bundles. For the first ASDL/SDL slice, it is acceptable to defer Pi bundle installation, but the resource model should not make it impossible.

## Why Pup's Design Works

Pup's design works because it optimizes for simple operational guarantees:

1. **One obvious command family**: users and agents can remember `skills list/install/path`.
2. **Static catalog**: every bundled resource is known at build/test time.
3. **Platform paths as data**: harness conventions are inspectable and unit-testable.
4. **Explicit scope switch**: `--project` is the single user-vs-project boundary.
5. **Aliases**: ergonomic platform names (`claude`, `gemini`, `pi-dev`) normalize to canonical names.
6. **Typed entry kinds**: skills, agents, and extensions share machinery without pretending to be identical.
7. **Multi-file bundles**: richer platform integrations are supported without a separate installer.
8. **Preview/path visibility**: users can inspect destinations before installing.
9. **No silent no-ops**: typoed filters and incompatible targets surface as errors.
10. **Tests match product invariants**: catalog and platform behavior is protected by ordinary unit tests.
11. **Agent-native framing**: skill installation is part of a larger CLI contract for agents.

## Recommended ASDL Adaptation

For ASDL, the first implementation should be smaller than Pup but preserve the same shape.

### Proposed domain objects

- `ResourceEntry`: name, description, type, content or files, applicable platform metadata, and source package identity.
- `ResourceCatalog`: a static catalog supplied by core ASDL, SDL, and later SDL extensions.
- `PlatformSpec`: canonical platform name, aliases, user/project skills paths, user/project agent paths, user/project extension paths, and formatting rules.
- `InstallScope`: user-global vs project-local.
- `InstallPlan`: deterministic list of destination paths, contents, skipped entries, warnings, and conflicts.
- `InstallResult`: materialized writes and skipped resources after executing a plan.

### First-slice command behavior

Core ASDL and SDL should expose equivalent behavior, even if command names differ:

```bash
asdl skills list
asdl skills path pi
asdl skills install pi --project

sdl skills list
sdl skills path pi
sdl skills install pi --project
```

If the user-facing name becomes `resources` instead of `skills`, the shape can remain identical:

```bash
asdl resources list
sdl resources install pi --project
```

The command naming question should be resolved before implementation because it affects docs, examples, and future extension contribution.

### First-slice package boundary

A dedicated package is justified. It should sit below SDL so `sdl` can consume it, and it should be callable from core `asdl` without duplicating logic. If core `asdl` remains Python while SDL is TypeScript, the Objective needs an explicit interop decision:

- implement the shared subsystem in TypeScript and have Python `asdl` delegate to a CLI;
- implement a small Python surface that consumes generated/static catalog data;
- or split shared data/specification from runtime-specific command wrappers.

The package should not depend on SDL extension discovery. SDL extensions can become catalog providers later.

### First-slice entry kinds

Recommended: design the model for `skill`, `agent`, and `extension`, but implement only the entry kinds needed by core ASDL/SDL resources first. If all current resources are skills, ship skills first with tests that make future bundle support an additive extension rather than a rewrite.

### Error and safety policy

Borrow these Pup behaviors directly:

- unknown platform is an error;
- unknown named resource is an error;
- filtered install with no materialized targets is an error;
- path conflicts with different content are errors;
- path preview is available before writes;
- user-global vs project-local scope is explicit in output;
- install code plans first, writes second.

Be more cautious about Pup's `all` behavior until ASDL has a clear product rule for implicit extension inclusion.

## Open ASDL Decisions

The Objective should resolve these before implementation hardens:

1. Package name: `@asdl/agent-resources`, `@asdl/assistant-resources`, `@asdl/skill-management`, or another name.
2. CLI vocabulary: `skills` vs `resources` vs `agent-resources`.
3. First entry-kind breadth: skills only, or skills plus agents/extensions.
4. Python/TypeScript boundary for core `asdl` and `sdl` CLI reuse.
5. Supported first platform set.
6. Whether `install` includes dry-run/plan mode or whether `plan` is a separate command.
7. How SDL extensions will contribute catalogs later without eager execution during help/discovery.

## Non-Recommendations

Do not start with:

- remote catalogs;
- a package marketplace;
- version resolution;
- update/uninstall semantics;
- dynamic extension execution during discovery;
- automatic migration of existing user skill directories;
- opaque generated state.

Pup's attractive property is not that it solves every future distribution problem. Its attractive property is that a static bundled resource installer can be useful immediately and remain understandable.
