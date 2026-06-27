# SDL Agent Instructions

## What SDL is

SDL (Source Development Lifecycle) is private, unreleased, agent-first tooling for running multi-session, multi-branch software work in a git-native way. It gives agents and humans a shared set of capabilities — durable planning **Objectives**, worktree **slots**, **branch-context** and branch memory, directed **handoffs**, and Graphite-based PR stacking — surfaced both as CLIs (`sdl`, `slot`, `objective`, `brmem`, …) and as Pi `/sdl:*` slash-commands. Assume you are one of many agents starting cold on this repo: orient yourself with the docs below before acting.

## Scope

This root `AGENTS.md` contains only repo-wide rules needed before choosing a directory, skill, or context file. Put directory rules in nested `AGENTS.md`, procedural detail in skills, and domain language in `CONTEXT.md`. Before editing under a subdirectory, read the nearest applicable nested `AGENTS.md` if present.

## Repo facts

- SDL is private, unreleased software; breaking changes are allowed.
- First-party implementation is TypeScript on Node 24+.
- Package workspace: `ts/` with pnpm.
- Default repo validation entrypoint: `just`.
- Python: always use `uv` (for example, `uv run python ...`); never call bare `python` or `python3`.

## Architecture rules

- Prefer composable features with explicit dependencies over hidden integration.
- Durable state should be git-native: refs, branches, GitHub issues/PRs where collaboration warrants; avoid hidden databases/ad-hoc state files.
- Keep units small and testable: pure transformations plus Gateway interfaces for external I/O.
- Port thoughtfully; do not copy abstractions unchanged when simpler designs fit.

## Major initiatives — load before non-trivial work

Before starting non-trivial work, load every active initiative orientation and treat
each as a repo rule while present:

    for d in .sdl/objectives/*/; do
      [ -f "${d}orientation.md" ] && [ ! -f "${d}closed.md" ] \
        && { echo "### ${d}orientation.md"; cat "${d}orientation.md"; echo; }
    done

Each `orientation.md` is the standing, agent-facing rule for an in-flight cross-cutting
initiative — it states where that part of the system is going vs. what you see in the
code now, and what to avoid. Design lives in ADRs, vocabulary in CONTEXT.md, full status
in the objective's `roadmap.md`. A file leaves this set automatically when its objective
closes (`closed.md` appears). Not every objective has one — only those whose direction
every agent must respect.

For the full slate of in-flight initiatives (not just the cross-cutting ones above), run
`objective list`. Before starting work, check whether your task overlaps an active
objective; if it does, read that objective's `objective.md` and `roadmap.md`.

## Context and routing

- For planning, design, or naming in a domain area, start at `CONTEXT-MAP.md`, then read the relevant `CONTEXT.md`.
- Use canonical terms and honor each term's *Avoid* list; treat map ambiguities as live distinctions.
- Edit `CONTEXT.md` files only when explicitly asked or doing domain-language work. If ordinary work reveals drift, report it instead of silently fixing it.

## Hard gates

- **Never commit on `main` or `master`**. If a commit/checkpoint is needed there, first switch/create a feature branch.
- Prefer LBYL (look before you leap) over EAFP.
- Keep features decoupled; do not reach into unrelated subsystems.
- Do not give calendar-time or effort-duration estimates unless the user asks.

## Formatting and validation

- `just` is the default repo validation entrypoint. If it reports a `dprint check` formatting failure, run `just dprint-fix` instead of hand-editing formatter output, then rerun validation.
- TypeScript format/lint autofixers (`just ts-format-fix`, `just ts-lint-fix`) and the rest of the `ts/` rules live in `ts/AGENTS.md`.

## Skills

- Use a skill when the user names it or the task matches its description. Multiple named skills mean use all; do not carry skills across turns unless re-mentioned.
- Read the skill's `SKILL.md` progressively; resolve relative paths from the skill directory; load only needed `references/`; prefer scripts/assets/templates over retyping large blocks.
- If a named skill is missing or unreadable, say so briefly and continue with the best fallback.
- Before creating, editing, installing, renaming, publishing skills, or touching `skills/` or `.agents/skills/`, read `docs/skill-conventions.md`.
- Review boundary: real directories under `.agents/skills/` are vendored third-party code. Review agents ignore embedded upstream code for normal lint/type/cleanup expectations and flag only integration-boundary issues unless explicitly asked to review the vendored dependency itself.

## TypeScript and CLI work

- Procedural rules for editing under `ts/` (tsgo typecheck, Vitest suite, Bun ban, format/lint autofixers) and for authoring CLI commands live in `ts/AGENTS.md`. Read it before editing any `.ts` file or designing a CLI surface.

## Git, Graphite, GitHub

- This repo uses Graphite (`gt`) as the default tool for branch and PR workflow; for branch creation, commits/amends, PR submit/update, and stack navigation/reshaping, read `.claude/skills/graphite/SKILL.md` and prefer `gt` over raw `git` where possible.
- Runtime package code must not depend on Graphite by default; prefer `GitGateway`. Before adding any runtime Graphite dependency, read `docs/graphite-dependency-boundary.md`. `slot gt` is the sanctioned exception.
- For GitHub backend work via GraphQL, REST, or `gh`, read `.claude/skills/code-gh/SKILL.md`.
