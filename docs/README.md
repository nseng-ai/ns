# Project Documentation

Start here before broad documentation searches. This directory collects cross-package design notes and system behavior docs; package-local usage belongs with the package that owns it.

## Where to Put Documentation

- `CONTEXT.md`: durable domain language and repo-wide conceptual grounding.
- `docs/`: cross-package design docs, system behavior, and contributor-facing documentation topology.
- `ts/packages/<pkg>/README.md`: package-specific usage, public CLI notes, and package-local entrypoints.
- `skills/<name>/SKILL.md`: user-facing agent procedure. Public skills should describe CLI operations and avoid implementation internals.
- `.ns/objectives/<slug>/`: durable Objective narrative, roadmap, updates, and closure.
- `.ns/prompts/`: checked-in reusable prompt assets consumed by repo tooling or skills; this is distinct from Pi `.pi/prompts` slash prompt templates.
- `docs/adr/`: durable architecture decision records. Accepted ADRs are historical records; update mutable guidance for tooling drift, or add a superseding/refining ADR for a new architectural decision.

## Index

- [ADR maintenance policy](adr/README.md): how to preserve accepted ADRs while keeping mutable guidance current.
- [Objective system](objective-system.md): how checked-in Objectives structure durable project work.
- [Branch retrospective evidence](aretro.md): deterministic session evidence aggregation and the tool-vs-LM boundary.
- [Pi docs](pi/README.md): Pi-specific notes used by this repo.
- [Skill/extension router pattern](patterns/skill-extension-router-pattern.md): consolidate rare workflow skills behind one router with lazy-loaded playbooks and optional selector commands.
- [Querying cmux help](cmux/help-querying.md): how agents should revalidate fast-changing cmux CLI behavior.
- [Retired Python `sdl exec` commands](sdl-exec/README.md): disposition notes and TypeScript replacement pointers for the former root exec surface.
- [GitHub Actions remote code authoring](research/remote-code-authoring-github-actions.md): ground-truth Erk survey and design lessons for using workflow dispatch as a remote agent authoring substrate.
- [Internal PR stack address workflow retrospective](retros/internal-pr-stack-address-retrospective.md): analysis of the stack-wide feedback workflow, with evidence and CLI push-down recommendations.
- [refactor-swarm-workflow](patterns/refactor-swarm-workflow.md): the multi-agent `Workflow`-tool engine for applying a file-local change across many files (distinct from the `refactor-swarm` skill).
- [Subagent pushdown](patterns/subagent-pushdown.md): guidelines for using subagents as bounded semantic subroutines while keeping deterministic JSON contracts at CLI/tool boundaries.
- [Harness skill/command/prompt invocation mechanics](research/harness-skill-invocation.md): how Claude Code, Codex, and Pi discover, surface, and gate skills/commands — invocation-control flags, ambient context cost, read roots, and namespacing — input to `areg` command conversion.
- [Matt Pocock Skills upstream adaptation](agents/matt-pocock-skills.md): imported Matt-sourced skills, ns-owned overlays, invocation semantics, and future update checklist.
- [Conflict resolution by thesis reapplication](patterns/thesis-reapplication.md): how to land a branch whose history can no longer be replayed by re-applying its intent against the current baseline, instead of rebasing or resolving conflicts.
- [Package extraction refactors](patterns/package-extraction-refactors.md): checklist for moving code into a new package while preserving dependency direction, public import boundaries, tests, docs, and validation evidence.
- [Roaster package README](../ts/packages/capabilities/roaster/README.md): how to configure `.ns/reviews/<key>/review.md`, run Roaster locally, and understand CI discovery/execution.
- [Roaster and `@pierre/diffs`](roaster-pierre-diffs.md): the roaster diff-parser integration boundary, Pierre APIs used, APIs deliberately not used, and accepted semantic changes from delegating to Pierre.
- [XDG Base Directory Specification](research/xdg-base-directory-spec.md): where programs read/write config, data, state, cache, and runtime files; the env-var defaults and rules; and how the standard relates to ns's git-native storage principle.

Agents should consult this README first, then follow the narrowest relevant link instead of scanning the whole repository.
