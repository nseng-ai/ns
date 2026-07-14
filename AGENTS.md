# ns Agent Instructions

## What ns is

ns is private, unreleased, agent-first tooling for running multi-session, multi-branch software work in a git-native way. It gives agents and humans a shared set of capabilities — durable planning **Objectives**, worktree **slots**, **branch-context** and branch memory, directed **handoffs**, and Graphite-based PR stacking — surfaced both as CLIs (`ns`, `slot`, `brmem`, …) and as Pi `/ns:*` slash-commands. Assume you are one of many agents starting cold on this repo: orient yourself with the docs below before acting.

## Scope

This root `AGENTS.md` contains only repo-wide rules needed before choosing a directory, skill, or context file. Put directory rules in nested `AGENTS.md`, procedural detail in skills, and domain language in `CONTEXT.md`. Before editing under a subdirectory, read the nearest applicable nested `AGENTS.md` if present.

## Repo facts

- ns is private, unreleased software; breaking changes are allowed.
- First-party implementation is TypeScript on Node 24+.
- Package workspace: `ts/` with pnpm.
- Default repo validation entrypoint: `just`.
- Python: always use `uv` (for example, `uv run python ...`); never call bare `python` or `python3`. This applies to one-off shell snippets, JSON helpers, and any agent-authored command, not just project scripts.

## Architecture rules

- Prefer composable features with explicit dependencies over hidden integration.
- Durable state should be git-native: refs, branches, GitHub issues/PRs where collaboration warrants; avoid hidden databases/ad-hoc state files.
- Keep units small and testable: pure transformations plus Gateway interfaces for external I/O. Before declaring a new external-tool gateway interface or consolidating overlapping gateways, read `docs/conventions/consumer-gateways-and-command-shape.md`.
- Port thoughtfully; do not copy abstractions unchanged when simpler designs fit.
- Workflow customization routes through extension points: before defining a point, installing at one (`ns.toml` `[points]`, `.ns/prompts/`), or consuming the point catalog from workflow code, read `docs/guides/points.md`.
- ns is self-hosting: this repo both develops the platform and is its first consumer. Before deciding whether new code is a platform capability (tested `ts/packages/*`) or a consumer instance (a `.ns/*` artifact), read `docs/conventions/platform-and-consumer.md`; provisional consumer artifacts must carry an explicit promotion path.

## Major initiatives — load before non-trivial work

Before starting non-trivial work, load every active initiative orientation and treat
each as a repo rule while present:

    ns objective exec load-orientations --format md

Each `orientation.md` is the standing, agent-facing rule for an in-flight orienting
Objective — an initiative whose direction cuts across all work; it states where that
part of the system is going vs. what you see in the code now, and what to avoid. Design lives in ADRs, vocabulary in CONTEXT.md, full status
in the objective's `roadmap.md`. The command owns deterministic inventory and
closed-marker mechanics and emits headers plus raw file contents. A file leaves this set
automatically when its objective closes (`closed.md` appears). Not every objective has
one — only those whose direction every agent must respect.

For the full slate of in-flight initiatives (not just the orienting ones above), run
`ns objective list`. Before starting work, check whether your task overlaps an active
objective; if it does, read that objective's `objective.md` and `roadmap.md`.

## Context and routing

- For planning, design, or naming in a domain area, start at `CONTEXT-MAP.md`, then read the relevant `CONTEXT.md`.
- Use canonical terms and honor each term's *Avoid* list; treat map ambiguities as live distinctions.
- Edit `CONTEXT.md` files when explicitly asked, when doing domain-language work, or when fixing obvious drift: a small, source-backed correction to stale vocabulary, paths, counts, package names, or `Avoid` aliases that needs no new terminology/product decision and does not broaden the implementation slice. If the drift is broad, ambiguous, or decision-bearing, record/report it instead of silently widening the work.

## Hard gates

- **Never commit on `main` or `master`**. If a commit/checkpoint is needed there, first switch/create a feature branch.
- Prefer LBYL (look before you leap) over EAFP.
- Keep features decoupled; do not reach into unrelated subsystems.
- Do not give calendar-time or effort-duration estimates unless the user asks.

## Search safety

Bound ordinary recursive search output by both line width and result count:

```bash
rg -n \
  --glob '!*.map' \
  --max-columns 300 \
  --max-columns-preview \
  'widget truncated' PATH |
head -n 200
```

`head -n 200` caps returned lines; `--max-columns 300 --max-columns-preview` prevents one huge matching line from consuming the context budget. Use `rg -l` when filenames are sufficient, and narrow the search path before increasing either limit.

The ns Pi harness automatically excludes `*.map`, `*.min.js`, and `*.min.css` through a process-scoped ripgrep config. This does not affect ordinary terminal searches or non-Pi harnesses. Use `rg --no-config` only when intentionally searching those generated artifacts.

## Context economy and evidence inheritance

Treat authoritative plans and handoffs as evidence caches: start from their supplied anchors, revalidate volatile state and explicit anchors, and do not repeat captured research or reconnaissance without a named trigger. Subagent findings are evidence for the rest of the session; do not repeat a child's scan in the parent. See `docs/conventions/agent-context-economy.md` for the full policy.

## Formatting and validation

- `just` is the default repo validation entrypoint. If it reports a `dprint check` formatting failure, run `just dprint-fix` instead of hand-editing formatter output, then rerun validation.
- TypeScript format/lint autofixers (`just ts-format-fix`, `just ts-lint-fix`) and the rest of the `ts/` rules live in `ts/AGENTS.md`.

## Skills

- Use a skill when the user names it or the task matches its description. Multiple named skills mean use all; do not carry skills across turns unless re-mentioned.
- Read the skill's `SKILL.md` progressively; resolve relative paths from the skill directory; load only needed `references/`; prefer scripts/assets/templates over retyping large blocks.
- For ns first-party skills, `skills/<name>/SKILL.md` is canonical. If a repo skill is named in docs or another skill but absent from the prompt's available-skill inventory, run `areg skill find <name> --format json`; if it succeeds, read the returned preferred `SKILL.md` path. If it returns suggestions, ask/choose deliberately rather than auto-loading a fuzzy match.
- If a named skill is missing or unreadable, say so briefly and continue with the best fallback.
- Before creating, editing, installing, renaming, publishing skills, or touching `skills/` or `.agents/skills/`, read `docs/conventions/skill-conventions.md`.
- Review boundary: real directories under `.agents/skills/` are vendored third-party code. Review agents ignore embedded upstream code for normal lint/type/cleanup expectations and flag only integration-boundary issues unless explicitly asked to review the vendored dependency itself.

## TypeScript and CLI work

- Procedural rules for editing under `ts/` (native TypeScript 7 typecheck, Vitest suite, Bun ban, format/lint autofixers) and for authoring CLI commands live in `ts/AGENTS.md`. Read it before editing any `.ts` file or designing a CLI surface.

## Git, Graphite, GitHub

- This repo uses Graphite (`gt`) as the default tool for branch and PR workflow; for branch creation, commits/amends, PR submit/update, and stack navigation/reshaping, load the `graphite` skill (if absent from available skills, resolve it with `areg skill find graphite --format json`) and prefer `gt` over raw `git` where possible.
- Runtime package code must not depend on Graphite by default; prefer `GitGateway`. Before adding any runtime Graphite dependency, read `docs/conventions/graphite-dependency-boundary.md`. `slot gt` is the sanctioned exception.
- For GitHub backend work via GraphQL, REST, or `gh`, load the `code-gh` skill (if absent from available skills, resolve it with `areg skill find code-gh --format json`).
