# Project Documentation

Start here before broad documentation searches. This directory collects cross-package design notes and system behavior docs; package-local usage belongs with the package that owns it.

## Where to Put Documentation

- `CONTEXT.md`: durable domain language and repo-wide conceptual grounding.
- `docs/`: cross-package design docs, system behavior, and contributor-facing documentation topology.
- `packages/<pkg>/README.md`: package-specific usage, public CLI notes, and package-local entrypoints.
- `skills/<name>/SKILL.md`: user-facing agent procedure. Public skills should describe CLI operations and avoid implementation internals.
- `.asdl/objectives/<slug>/`: durable Objective narrative, roadmap, updates, and closure.
- `.asdl/prompts/`: checked-in reusable prompt assets consumed by repo tooling or skills; this is distinct from Pi `.pi/prompts` slash prompt templates.
- `docs/adr/`: durable architecture decision records.

## Index

- [Objective system](objective-system.md): how checked-in Objectives structure durable project work.
- [Branch retrospective evidence](aretro.md): deterministic session evidence aggregation and the tool-vs-LM boundary.
- [Pi docs](pi/README.md): Pi-specific notes used by this repo.
- [Skill/extension router pattern](skill-extension-router-pattern.md): consolidate rare workflow skills behind one router with lazy-loaded playbooks and optional selector commands.
- [Querying cmux help](cmux/help-querying.md): how agents should revalidate fast-changing cmux CLI behavior.
- [asdl exec commands](asdl-exec/README.md): deterministic command boundaries for skills and agents.
- [GitHub gateway conformance fixtures](github-gateway-conformance-fixtures.md): live GitHub fixture policy.
- [GitHub Actions remote code authoring](remote-code-authoring-github-actions.md): ground-truth Erk survey and design lessons for using workflow dispatch as a remote agent authoring substrate.
- [Internal PR stack address workflow retrospective](internal-pr-stack-address-retrospective.md): analysis of the stack-wide feedback workflow, with evidence and CLI push-down recommendations.
- [refactor-swarm-workflow](refactor-swarm-workflow.md): the multi-agent `Workflow`-tool engine for applying a file-local change across many files (distinct from the `refactor-swarm` skill).
- [Subagent pushdown](subagent-pushdown.md): guidelines for using subagents as bounded semantic subroutines while keeping deterministic JSON contracts at CLI/tool boundaries.
- [Conflict resolution by thesis reapplication](thesis-reapplication.md): how to land a branch whose history can no longer be replayed by re-applying its intent against the current baseline, instead of rebasing or resolving conflicts.
- [TypeScript porting playbook](typescript-porting-playbook.md): reusable migration guidance for porting Python-backed capabilities to TypeScript — vertical-slice shape, parity discipline, gateway/fake seams, bundle distribution, and retirement sequencing — proven by the `pr-address` port.

Agents should consult this README first, then follow the narrowest relevant link instead of scanning the whole repository.
