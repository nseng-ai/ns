# Agent Skill and Command Surface Consolidation

## Thesis

The repo's agent-facing surface has grown again. The original Pi command cleanup succeeded for the then-current problem, but the current bottleneck is broader: there are many first-party skills, many installed remote or vendored skills, several Pi slash-command families, command-wrapper skills, internal prototype skills, CLI `exec` helpers, and routing instructions in `AGENTS.md` / `CLAUDE.md`. More surface is now making agent routing harder: similar workflows compete for attention, internal prototypes look like durable products, command skills can carry stale scaffolding, and Pi commands, portable skills, and CLI primitives do not always communicate their relationship clearly.

This Objective now owns a renewed consolidation pass. The desired outcome is a smaller and more coherent agent workflow surface, not merely a lower count. Each durable capability should have one clear public story: what problem it solves, which harness or CLI entrypoints are first class, which skill is the portable semantic layer if one exists, which commands are implementation details, and which experimental, internal, vendored, or user-local resources are intentionally outside the primary product surface.

The Objective slug remains `pi-resource-surface-cleanup` for continuity, but the working title and scope are now agent skill and command surface consolidation. Historical Pi cleanup evidence remains useful background; closure now depends on the current skill/command inventory and the consolidation decisions made from it.

## Scope

In scope:

- First-party skills under `skills/<name>/SKILL.md`, including trigger descriptions, frontmatter, internal metadata, command-skill conventions, H1/body shape, token burden, progressive disclosure, and CLI push-down opportunities.
- Installed skill surfaces under `.agents/skills/` and `.claude/skills/`, including symlink correctness for first-party skills, real-directory remote or vendored skills, and `skills-lock.json` provenance or stale hash state.
- Project-local Pi command surfaces under `.pi/extensions/` and engineered extension code under `ts/packages/pi-extensions/` when command naming, grouping, visibility, or wrappers affect the agent resource surface.
- Any project prompt surface under `.pi/prompts/` if it reappears, with duplicate prompt/extension/skill exposure treated as consolidation debt.
- CLI command groups and `exec` helpers that are invoked by skills or Pi wrappers, especially when they can replace long procedural prompt bodies or clarify public-vs-internal boundaries.
- Repo instruction and catalog docs such as `AGENTS.md`, `CLAUDE.md`, `docs/pi/README.md`, `docs/agent-resource-catalog.md`, and skill-related standards or workflow docs when they route agents to skills, commands, or harness-specific entrypoints.
- Naming and lifecycle policy for categories such as public portable workflow skills, command skills, internal/dev skills, prototypes, Pi-only adapters, CLI primitives, remote/vendored skills, and user-local personal resources.
- Fresh inventory of the current checkout's skill and command surface. Current evidence is recorded in `docs/agent-resource-catalog.md` and `docs/pi/README.md`: `skills/` has 42 first-party `SKILL.md` files; `.agents/skills/` and `.claude/skills/` each expose 50 entries; `skills-lock.json` has 50 entries; `.pi/extensions/` has 10 project-local adapter files; `.pi/prompts/` and `.pi/skills/` are absent. The catalog's current public command inventory distinguishes 22 project Pi extension commands, 42 first-party skill commands, 3 project Pi custom tools, and 8 ignored vendored/external skill commands; Pi RPC inventory remains the canonical visible-command source when rerun.
- Low-risk cleanup that follows directly from the audit, such as stale `Original description` headings in command skills, over-broad trigger descriptions, missing H1s, excessive SKILL.md bodies, or internal/prototype skills that should not read as durable public workflows.

Confirmed boundaries:

- The Objective slug remains `pi-resource-surface-cleanup`; do not rename or recreate the Objective directory as part of this rephase.
- Consolidation should improve routing, safety, ownership, and maintainability. Do not remove useful workflows simply to make a count smaller.
- User-local Pi resources under `~/.pi/agent/...` remain advisory and explicit-request-only; closure-critical implementation changes should be checked into the repo.
- Remote or vendored real-directory skills under `.agents/skills/` remain live until an explicit skill-management decision changes that. They should be inventoried and dispositioned, not silently edited as first-party code.
- Pi, Codex, and Claude remain the first-class harnesses for this repo, but not every capability needs identical UX in all three. A Pi slash command, a portable skill, and a CLI operation can be different entrypoints to the same capability when the relationship is explicit.

## Non-Goals

- Do not deeply rewrite GitHub-sourced or vendored skills by default. Audit their presence, provenance, trigger cost, and keep/remove disposition; edit vendored content only with an explicit decision.
- Do not mutate user-local Pi resources, CMUX workflows, `gh-pr`, `stack-latest`, or other personal-machine resources unless explicitly requested.
- Do not redesign Pi, Codex, Claude, their discovery systems, or the Objective system.
- Do not create a hidden registry, UUID layer, YAML task database, or state machine for skills and commands. Use checked-in Markdown, actual discovery evidence, tests, and existing skill-management tooling.
- Do not force every workflow into a skill or every skill into a slash command. The right surface may be a skill, a Pi wrapper, a CLI command, documentation, or no public surface.
- Do not reopen already-settled historical Pi command migrations unless current inventory shows they are stale, confusing, duplicated, or contradicted by newer workflows.

## Completion Criteria

This Objective can close when all of the following are true:

- A fresh cross-surface inventory has been recorded after the current growth phase, covering first-party skills, installed `.agents` / `.claude` skills, `skills-lock.json`, Pi RPC commands, `.pi/extensions/`, `.pi/prompts` presence or absence, relevant CLI `exec` helpers, and agent instruction/catalog docs.
- The repo has a documented taxonomy for agent workflow resources: public portable workflow skills, command skills, internal/dev skills, prototype skills, Pi-only adapters, CLI primitives, remote/vendored skills, and user-local personal resources.
- Every first-party skill has an explicit disposition: keep as public workflow, keep as command/internal wrapper, merge, rename, split, delete, push deterministic work down into a CLI, move material to references/README, or defer with rationale.
- The obvious first-party quality issues found during inventory are resolved or explicitly accepted, including stale command-skill headings such as `Original description`, missing or mismatched H1s, command descriptions that do not follow convention, over-broad trigger descriptions, and large prompt bodies that should be progressively disclosed or pushed down.
- Command and wrapper families have coherent public stories across Pi, skills, and CLI entrypoints. At minimum, Objective/prototype runners, handoff/Branch Memory, branch retrospective, dev/source-control, GitHub/Graphite, PR-address/review, and Pi UI/internal surfaces have been dispositioned against the taxonomy.
- Any skill additions, removals, or renames are performed through the repo's skill-management conventions so `skills/`, `.agents/skills/`, `.claude/skills/`, and `skills-lock.json` remain consistent.
- Remote/vendored skills have a deliberate keep/remove policy for this repo's installed surface, with no accidental deep-audit requirement placed on them.
- Pi command exposure has been re-inventoried after material changes; duplicate commands, unintended legacy aliases, and confusing namespace collisions are either absent or intentionally documented.
- `AGENTS.md`, `CLAUDE.md`, `docs/agent-resource-catalog.md`, `docs/pi/README.md`, and any relevant skill docs route agents to the consolidated surface without preserving stale names from earlier phases.
- Relevant validation has passed for touched areas: at least `git diff --check` and Markdown formatting for docs/skills, plus TypeScript or Python checks when implementation files change.
- Meaningful decisions, assumptions, risks, and completion evidence have been recorded through Objective updates as the consolidation proceeds.

## Assumptions and Risks

Assumptions:

- The previous Pi-specific cleanup was successful but no longer sufficient: the primary problem has shifted from a few duplicate or poorly named Pi commands to overall skill/command proliferation and routing ambiguity.
- The automatically visible skill description surface has real cost. A large number of installed skills can degrade agent routing even when each individual skill is useful.
- First-party `skills/<name>` documents are the right place for portable semantic workflow guidance when a workflow should be usable by Codex, Claude, and Pi.
- Pi slash commands are best treated as concise harness adapters or pickers over portable skills and CLI primitives, except when a workflow is intentionally Pi-only.
- Command skills should stay terse and mechanical; long procedural logic, repeated shell parsing, or deterministic evidence collection should move toward tested CLI operations when the push-down win is large enough.
- `code-` / `internal-code-` skills and `/code:*` Pi commands are now the canonical surface for codebase/source-control management such as worktree snapshots, branch/stack maintenance, and Graphite/GitHub workflows that manage code state. Public portable code workflows use the `code-*` prefix; repo-private code/source-control skills use `internal-code-*`, with visibility carried by `metadata.internal: true` rather than the prefix itself. `dev-` and `/dev:*` no longer mean generic code work; `dev-` is reserved for the future `asdl-dev` namespace, and `/dev:*` retains only the `asdl-dev` CLI mirrors (`preview-url`) while `cp`/`submit` now live under `/code:*`.
- Internal and prototype skills can be valuable, but their names, descriptions, frontmatter, and docs should make their lifecycle obvious so they do not crowd the durable public workflow surface.
- Remote/vendored skills may remain useful developer aids, but their trigger descriptions and installation count affect the same agent routing surface as first-party skills.
- The existing `docs/agent-resource-catalog.md` and `docs/pi/README.md` are the active homes for the consolidated policy and current inventory. They now distinguish the `/code:*` local code/source-control family from `/dev:*` `asdl-dev` mirrors, while future material changes still need fresh inventory evidence before closure.

Risks:

- Over-consolidation could hide useful expert workflows behind too few generic names. Consolidation should preserve affordances that materially improve agent performance.
- Under-consolidation could leave the repo with many near-duplicate ways to start the same workflow, causing future agents to choose stale or unsafe paths.
- Prototype workflows such as `proto-objective-impl` can become permanent by accident if no lifecycle decision is made. The current decision parks the merge/promote/retire question rather than making it the next slice; low-risk hygiene may clarify prototype/internal labeling, but lifecycle consolidation should be explicitly unparked before renaming or removing that surface.
- Internal backend skills such as `pi-grill-ui` can confuse non-Pi agents if they look like public workflows.
- The Objective/standing-objective/prototype runner area is likely to churn; decisions there should distinguish current cleanup from deeper product design that belongs in separate Objectives.
- Removing or renaming installed skills without skill-management discipline can leave broken symlinks, stale lock entries, or mismatched `.agents` / `.claude` surfaces.
- Documentation-only policy can drift unless paired with actual inventory commands, tests, and post-change evidence.
- The `code-` / `internal-code-` / `dev-` boundary can drift if future source-control workflows are added under `dev-`, or if the public-vs-internal split between `code-*` and `internal-code-*` is applied inconsistently (for example by relying on the prefix instead of `metadata.internal: true`); current policy and docs reduce this risk but do not eliminate the need for review.

## Open Questions

No active non-parked questions remain for this Objective.

Accepted or parked follow-ups:

- `proto-objective-impl` and `/proto:objective-impl` remain a parked prototype Objective runner surface. Merge, promote, or retire it only through an explicit unparked decision.
- PR-address/review automation helper or CLI push-down work is parked because the user is already working that slice separately; record landed evidence later only if it changes this Objective's durable disposition.
- Deep rewrites or removals of vendored/GitHub-sourced skills remain parked unless a separate explicit skill-management decision treats one as first-party work.
- Future promotion, merge, or removal decisions for individual `internal-code-*` skills should be handled as explicit new work. The current Objective resolves their routing by documenting them as repo-private `metadata.internal: true` skills.
- Future resource-surface cleanup should optimize for clearer categories and safer routing rather than raw command or skill count alone.

## Closure

Outcome: completed.

The Objective closed after the final routing-docs and inventory pass on 2026-06-03. The checked-in agent-resource story is now coherent across `AGENTS.md`, `CLAUDE.md`, `docs/agent-resource-catalog.md`, `docs/pi/README.md`, first-party skills, installed skill mirrors, and project-local Pi extensions:

- Public code/source-control workflows use `code-*` skills and `/code:*` Pi commands; repo-private code/source-control workflows use `internal-code-*` skills with `metadata.internal: true`; `dev-` and `/dev:*` are no longer generic code-management names and are reserved for `asdl-dev`-affiliated surfaces such as `/dev:preview-url`.
- The final catalog inventory records 42 first-party skill commands, 50 installed `.agents/skills/` entries, 50 `.claude/skills/` mirrors, 50 `skills-lock.json` entries, 22 project Pi extension commands, 3 project Pi custom tools, 10 `.pi/extensions/*.ts` files, and no `.pi/prompts/` or `.pi/skills/` project surfaces.
- Pi RPC `get_commands` evidence reported 88 visible commands total, 22 repo-owned project extension commands, 50 project skill commands, no project prompt commands, and no legacy `/dev:cp`, `/dev:submit`, `/cp`, `/newbr`, `/submit`, `/gh:land`, `/gt:land-stack`, `/land`, or `/land-stack` aliases.
- The final stale-name/routing search found no active `Original description` scaffolding and no stale current-routing `dev-*` names. Remaining `dev-objective-impl` references are preserved historical design notes; `proto-objective-impl` references are explicitly parked prototype-runner routing; `pr-address` references remain the public review-addressing workflow.
- The stale landing-history row in `docs/pi/README.md` was corrected to route current landing behavior through `/code:land` and `/code:land-stack`, and the catalog now includes the live `/grill-ui`, `grill_ask`, `/proto:objective-impl`, `pi-grill-ui`, `proto-objective-impl`, `typescript-style`, and `typescript-fake-driven-testing` surfaces instead of undercounting them.

Accepted caveats: the 11 local-only `PENDING_REGEN` hashes in `skills-lock.json` remain accepted install-time metadata; prototype-runner lifecycle, PR-address/review automation push-down, deep vendored-skill rewrites/removals, and user-local personal resources remain parked follow-ups rather than active closure blockers.

Validation for the closing docs/tracking pass: `git diff --check` passed; `just dprint-check` passed after `just dprint-fix`; TypeScript and Python checks were not rerun because only Markdown documentation and Objective tracking files changed.
