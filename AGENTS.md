# ASDL — Agent Onboarding

## Read This First

Every agent session starts with zero context: no memory of prior sessions, no accumulated familiarity with this repo. This file is the entire day-one onboarding — anything not written here, or routed to from here, does not exist for the agent. (That is also a deliberate reminder to humans editing this repo: if a rule matters, it must be written down and reachable from here.)

Agent instructions live in four tiers:

1. **Root `AGENTS.md`** (this file) — repo-wide onboarding, always loaded into every session.
2. **Nested `AGENTS.md` files** — directory-scoped onboarding, read when working in that area.
3. **Skills** — on-demand procedural manuals, loaded when a task matches.
4. **CONTEXT files** — domain language for an area, entered via `CONTEXT-MAP.md` (see "Domain Language" below).

Placement policy: root `AGENTS.md` holds only rules that apply repo-wide AND are needed before an agent can pick the right skill or directory — every line here is paid for in tokens by every agent, every session. Directory-scoped rules go in that directory's `AGENTS.md`; procedural depth goes in skills. Every rule must be self-contained for a reader with zero prior sessions — no tribal references.

## Orientation

### What is ASDL?

ASDL is a composable toolkit for plan-oriented agentic engineering: tooling that helps humans and agents plan work, implement it in isolated environments, and carry context across sessions.

**The goal**: each feature should be usable on its own, without buying into the entire system. A team should be able to adopt just the plan workflow, etc., without pulling in unrelated machinery.

Major features:

- **Plans and branch contexts** — write an implementation plan, attach it to a branch, implement from it in a fresh session.
- **Worktree slots** — parallel isolated checkouts for concurrent agent sessions.
- **Branch Memory and handoffs** — branch-scoped durable context that carries decisions between sessions.
- **Objectives** — tracked units of planned work with priorities.
- **PR feedback tooling** — classify, plan, and resolve review feedback end-to-end (`pr-address`).

### Status

Unreleased, private software. We can break backwards compatibility freely.

### Tech Stack

- **Language**: Python 3.11+ (uv)
- **CLI**: Click
- **Build**: Hatchling
- **Linting/Formatting**: Ruff
- **Type checking**: ty
- **Testing**: pytest

### Project Structure

```
asdl/
├── src/asdl/          # Main package
│   └── cli/            # Click CLI entry point
├── tests/              # Test suite
├── pyproject.toml      # UV project config
└── justfile            # lint, fix, ty, test, fast-ci
```

### Design Principles

1. **Composability over integration** — each feature works standalone. No hidden coupling between subsystems.
2. **Git-native storage** — durable state lives in git-native mechanisms: branch-scoped refs (Branch Memory), branches, and GitHub issues/PRs where collaboration warrants. Never hidden databases or ad-hoc state files.
3. **Small, testable units** — pure functions and data transformations over complex class hierarchies. Gateway interfaces for external I/O.
4. **Port, don't copy** — when porting existing code, rethink the design. Simplify interfaces, remove unnecessary abstractions, and cut dependencies.

## Domain Language

`CONTEXT-MAP.md` at the repo root is the entry point to the repo's domain language: it inventories the `CONTEXT.md` files that exist and are planned, candidate relationships between them, and flagged ambiguities.

Before planning, designing, or naming things in an area, read that area's `CONTEXT.md` — route to it via the map. Use the canonical terms in code, docs, and PRs; treat each term's _Avoid_ list as binding anti-vocabulary; the map's flagged ambiguities are live distinctions to respect, not noise.

Edit CONTEXT files deliberately, never incidentally: only when the task is explicitly about domain language (a grill-with-docs session, a focused context/rebaseline session, or direct user instruction). If ordinary work surfaces drift between code and a CONTEXT file, report it as a finding — never fix it silently.

## Ground Rules

- **Never use raw `pip install`**. Always use `uv`.
- **Never commit directly to `main`**. Create a feature branch first.
- Prefer LBYL (look before you leap) over EAFP (easier to ask forgiveness).
- Use frozen dataclasses or Pydantic models for data. Avoid mutable state where possible.
- Use modern Python type syntax (`str | None`, not `Optional[str]`).
- Keep features decoupled. A feature should declare its dependencies explicitly, not reach into other subsystems.

### Planning and Estimates

- Do not provide calendar-time or effort-duration estimates for engineering work unless the user explicitly asks for them. Prefer dependency order, migration shape, scope/risk notes, and concrete next actions.

### Fixing Lint and Format Failures

When `just` reports a lint or format failure, do not hand-edit files to satisfy the formatter. Run the corresponding autofix recipe instead:

- `ruff check` failures → `just fix` (runs `ruff check --fix --unsafe-fixes` then `ruff format`)
- `ruff format --check` failures → `just fix`
- `dprint check` failures (Markdown / TOML) → `just dprint-fix` (runs `dprint fmt`)

After autofixing, re-run `just` to confirm the suite is green. Only edit files by hand when the failure is a real lint/type/test bug that the autofixer cannot resolve.

## Skills

A skill is a set of local instructions to follow that is stored in a `SKILL.md` file. Installed skills are discovered natively from the on-disk skill directories and their `SKILL.md` frontmatter. `AGENTS.md` is for project instructions, not a hand-maintained skill index.

### How to use skills

- Discovery: Rely on installed skills and their `SKILL.md` frontmatter. Do not maintain a duplicate list in this file.
- Trigger rules: If the user names an installed skill (with `$SkillName` or plain text) OR the task clearly matches an installed skill, you must use that skill for that turn. Multiple mentions mean use them all. Do not carry skills across turns unless re-mentioned.
- Missing/blocked: If a named skill is not installed or its `SKILL.md` cannot be read, say so briefly and continue with the best fallback.
- How to use a skill (progressive disclosure):
  1. After deciding to use a skill, open its `SKILL.md`. Read only enough to follow the workflow.
  2. When `SKILL.md` references relative paths, resolve them relative to the skill directory first.
  3. If `SKILL.md` points to extra folders such as `references/`, load only the specific files needed for the request; don't bulk-load everything.
  4. If `scripts/` exist, prefer running or patching them instead of retyping large code blocks.
  5. If `assets/` or templates exist, reuse them instead of recreating from scratch.
- Coordination and sequencing:
  - If multiple skills apply, choose the minimal set that covers the request and state the order you'll use them.
  - Announce which skill(s) you're using and why in one short line.
  - If you skip an obvious skill, say why.
- Context hygiene:
  - Keep context small: summarize long sections instead of pasting them; only load extra files when needed.
  - Avoid deep reference-chasing: prefer opening only files directly linked from `SKILL.md` unless you're blocked.
  - When variants exist, pick only the relevant reference file(s) and note that choice.
- Safety and fallback: If a skill can't be applied cleanly, state the issue, pick the next-best approach, and continue.

Skill-authoring and skill-management conventions live in `docs/skill-conventions.md` — read it before creating, editing, installing, renaming, or publishing skills, or before touching anything under `skills/` or `.agents/skills/`. One fact from it is load-bearing repo-wide: real directories under `.agents/skills/` are vendored third-party code; all code review agents must ignore their embedded upstream code for normal linting, typechecking, review, and cleanup expectations, and should only flag integration-boundary issues unless explicitly asked to review the vendored dependency itself — details in `docs/skill-conventions.md`.

## Code Conventions

### Package Import Rules

- Packages in this repo do **not** publicly re-export symbols from `__init__.py`. Package `__init__.py` files should be empty or contain only a docstring.
- Consumers must import from the canonical source module (e.g., `from asdl_core.clinkr.group import ClinkrGroup`, not `from asdl_core.clinkr import ClinkrGroup`).
- Do not use `__all__` or `import X as X` re-export patterns in `__init__.py` files.
- Do not prefix module filenames with a leading underscore (e.g., `_gateway_access.py`). Because `__init__.py` files are empty, every module's canonical path is already its public path — there is nothing to mark "package-private." `__init__.py` itself is exempt; the rule is about regular `.py` modules.

### CLI Scenario Testing Convention

Each CLI package has two entry points: a standalone CLI (e.g., `pr-address`) built by `build_cli()` in `<package>.cli.main`, and an asdl plugin subgroup discovered via `asdl.plugins` entry points. Test them separately:

**Scenario tests** live in their home package (e.g., `packages/asdl-pr-address/tests/scenario/`) and should exhaustively cover every user-facing scenario for that package's standalone CLI via `build_cli()`. This is the user-facing entry point and the right level to test. The fixture should be `cli_group = build_cli()`, not `discover_group(...)` directly. Include `--version` and `-h` tests alongside operation tests in the same file.

**Plugin smoke tests** (`tests/scenario/test_plugins.py` in the top-level asdl package): Verify that each plugin's entry point wires up correctly through `discover_plugins`. One test per plugin that mounts the subgroup and invokes a representative command. These live at the asdl scope because they test the plugin discovery contract.

### Skill-Invoked CLI Commands (exec Subgroups)

CLI commands intended for skill/agent invocation rather than interactive humans MUST be registered under a nested `exec` ClinkrGroup inside the package's outer group — e.g., `pr-address exec get-reviews`, `brmem exec resolve-prompt`, `roaster exec format-findings-comment`. This keeps user-facing top-level help focused on commands a human would actually type.

- **Visibility:** the `exec` subgroup MUST be `hidden = True`. Users do not discover these commands by reading top-level `--help`; they discover them by reading the skill that drives them. Pass `hidden=True` as a kwarg to the `ClinkrGroup` constructor — by convention `ClinkrGroup` is treated as immutable after construction, so do not mutate `.hidden` afterward. Hiding only affects help-text rendering, not invocability — `pkg exec <op>` continues to work.
- **Layout:** operation files for exec commands live in `<package>/exec/`, with `exec/group.py` exposing a `build_exec_group()` (or equivalent) that the package's outer `group.py` mounts via `outer.add_command(exec_group)`. `exec/__init__.py` follows the repo's empty-init rule (docstring only, no re-exports).
- **Naming:** prefer noun-or-verb-phrase command names (`resolve-prompt`, `get-reviews`) — the `exec` namespace already implies the actor, so the verb does not need to.
- **Canonical examples:** `packages/asdl-pr-address/src/asdl_pr_address/cli/pr_address/group.py`, `packages/roaster/src/roaster/cli/roaster/exec/group.py`, `packages/asdl-core/src/asdl_core/brmem/group.py`.

### TypeScript Style

When writing, reviewing, or refactoring TypeScript, strictly follow the `typescript-style` skill (`.agents/skills/typescript-style/SKILL.md`).

- Load the skill before TypeScript work and read `.agents/skills/typescript-style/core-rules.md` before implementation.
- Use `.agents/skills/typescript-style/idioms.md` for coding idioms and `.agents/skills/typescript-style/checklist.md` before declaring TypeScript work complete.
- Load the relevant `.agents/skills/typescript-style/references/` document before designing TypeScript abstractions covered by the skill, including backend/provider boundaries, error handling, plugin/extension APIs, stateful workflow/context code, or TUI code.
- Treat the skill as the default TypeScript authority while still honoring the skill's precedence rules for explicit project tooling, public API compatibility, and established local conventions.

### TypeScript Test Execution

Current `ts/` package tests are Vitest-backed. The TS test suite is expected to be fast: for TS implementation plans, grill sessions, and completion criteria, default to running the full TS validation commands instead of asking whether to narrow validation scope. Use pnpm/Vitest commands such as `pnpm --dir ts run test`, `pnpm --dir ts run check`, package scripts when debugging a specific failure, or `just ts-test`. Do not add new package tests that depend on Bun's test runner.

If you are working in an out-of-scope template or standalone Bun project that intentionally still uses Bun's test runner, run direct Bun tests sequentially: `bun test --sequential`.

## Source Control & GitHub

### Branch Creation and PR Submission (Graphite)

This repo uses Graphite (`gt`) as the default tool for branch and PR workflow. Whenever you create branches, amend commits, submit or update PRs, or navigate and reshape stacks, always consult the `graphite` skill (`.claude/skills/graphite/SKILL.md`) first. Prefer `gt` over raw `git` for these operations:

- Creating branches: use `gt create <name> -m "<msg>"` instead of `git checkout -b` + `git commit`.
- Amending the current branch: use `gt modify -m "<msg>"` instead of `git commit --amend`.
- Submitting / updating PRs: use `gt submit --no-interactive` instead of `git push` / `gh pr create`.
- Navigating and reshaping stacks: `gt up` / `gt down` / `gt ls` / `gt restack` / `gt move`.

Fall back to raw `git` only when `gt` cannot express the operation (e.g., surgical `git rebase` during conflict resolution — see the `graphite` skill's "Surgical Rebasing" section).

### Runtime Graphite Dependency Boundary

Graphite is the contributor workflow tool for this repo, but runtime package code must not depend on Graphite by default. Before importing `asdl_core.gt`, accepting a `GtGateway`, constructing `RealGtGateway`, shelling out to `gt`, or adding Graphite to a CLI context, first check whether the same behavior can be satisfied through the git gateway.

- Use `GitGateway` for ordinary repository facts: current branch, trunk/base branch, local branch existence, refs, commit ranges, patch IDs, and worktrees.
- A command or command group may depend on Graphite only when Graphite is part of its explicit user-facing contract: the command path, help text, and docs should name Graphite or `gt`, and the behavior should require Graphite stack metadata rather than plain git history.
- `slot gt` is the canonical opt-in Graphite command group and should be excluded from Graphite-boundary audits. Its name is the contract.
- Do not parse human-facing Graphite display output (`gt ls`, `gt ls --stack`, `gt log`, `gt branch info`) for machine topology decisions. Use Graphite plumbing such as `gt parent --no-interactive` / `gt children --no-interactive`, or `slot gt exec stack-branches` / `--format json` for current-stack topology. Display commands are fine for human visual confirmation only.
- Do not introduce Graphite dependencies into generic workflows, package contexts, or skill `exec` helpers as a convenience for stack discovery. If a workflow needs Graphite-specific stack semantics, put that behavior behind an explicit Graphite-named command or command group.

### GitHub Backend Interactions

When adding or editing any code that interacts with the GitHub backend — whether through GraphQL queries, REST API calls, or `gh` CLI commands — always consult the `code-gh` skill (`.claude/skills/code-gh/SKILL.md`) and its references first. This ensures correct API selection (REST vs GraphQL), proper rate-limit awareness, and consistency with the existing gateway patterns in `asdl-core`.
