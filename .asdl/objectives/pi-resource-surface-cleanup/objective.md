# Harness-Neutral Agent Resource Surface Cleanup

## Thesis

The repo's agent-facing command, skill, prompt, and documentation surface should be intentional, legible, and portable across the first-class harnesses this project actually uses: Pi, Codex, and Claude. Pi still matters: a Pi RPC inventory found 74 visible slash commands, a duplicate `/objective-stack-impl` extension/prompt exposure, low-signal local skill descriptions, status commands with indistinct descriptions, GitHub-sourced remote skills that are live but intentionally excluded from deep audit, and several large user-local extensions that are personal tool-stack workflows rather than repo-general products. Those findings are now treated as the Pi projection of a broader agent-resource problem, not as the whole problem.

This Objective turns the audit into staged cleanup and durable cross-harness policy. The desired outcome is not to generalize every useful personal Pi workflow or to force every harness to expose identical slash commands. The desired outcome is to clarify which capabilities are repo-owned, where their portable core lives, how Pi exposes them, how Codex and Claude can invoke or follow them, and which personal or vendored resources remain advisory. Pi-specific wrappers should be thin where practical; reusable workflow meaning should live in checked-in skills, CLI operations, prompt assets, or docs that Codex and Claude can also discover.

## Scope

In scope:

- A harness-neutral policy for repo-owned agent capabilities, distinguishing portable core workflow semantics from harness-specific entrypoints and adapters.
- First-class target harnesses: Pi, Codex, and Claude. Other harnesses may benefit, but they are not closure-critical for this Objective.
- Checked-in project-local Pi resources under `.pi/extensions/` and `.pi/prompts/`, including whether a Pi command is an adapter over a portable capability or a Pi-only workflow.
- Repo-owned skills under `skills/<name>/SKILL.md` and their installed surfaces under `.agents/skills/` and `.claude/skills/`, because these are the primary checked-in Codex/Claude/Pi shared workflow documents in this repo.
- Repo agent instruction surfaces such as `AGENTS.md` and `CLAUDE.md` when they affect discoverability, routing, or harness-specific boundaries.
- Engineered Pi extension code and tests under `ts/packages/pi-extensions/` when a checked-in extension behavior needs testing, promotion, or disposition.
- Repo-specific documentation under `docs/pi/` and any adjacent harness-neutral agent docs needed to explain the cross-harness policy without pretending all resources are Pi-only.
- Pi RPC command inventory as the source of truth for the Pi visible command surface during this work, plus filesystem/provenance inspection of skills and agent instruction files as the corresponding Codex/Claude evidence.
- Low-risk metadata cleanup, including local command-skill descriptions and distinct descriptions for related status commands.
- Resolution of the duplicate `/objective-stack-impl` surface in a way that avoids Pi autocomplete/entrypoint confusion while preserving a portable Objective-stack implementation path for Codex and Claude.
- A documented runtime policy decision for GitHub-sourced `npx skills` / remote skills that are live under `.agents/skills/` and `.claude/skills/` but excluded from deep review.
- A disposition for checked-in risky or mutating commands, especially `/land`, such as promotion into tested package/CLI code, replacement/deprecation, or an explicit retained-as-is rationale that also says what Codex and Claude users should do.
- Audit narrative and advisory disposition for user-local resources such as CMUX slot commands, `gh-pr`, `stack-latest`, and user-local skills when they affect the visible Pi surface from this checkout.

Confirmed boundaries:

- The Objective slug remains `pi-resource-surface-cleanup`; title/prose broadening does not imply a slug migration.
- User-local implementation changes under `~/.pi/agent/...` are advisory and explicit-request-only. Closure-critical implementation work should be checked into the repository unless a later user request explicitly changes that boundary.
- CMUX commands are tailored to a specific personal stack of tools. They should not be presented as generalized repo products merely because they are complex.
- Real-directory remote or vendored skills under `.agents/skills/` remain live by default as developer aids. Removal or disabling requires explicit skill-management work; no implementation change is required by this Objective's current remote-skill runtime policy.
- No dedicated `.codex/` surface exists in this checkout today. Codex support should therefore start from `AGENTS.md`, repo-owned skills, and CLI/docs workflows unless evidence shows a Codex-specific checked-in surface is needed.

## Non-Goals

- Do not deeply audit or rewrite GitHub-sourced remote skills that were excluded from the audit scope.
- Do not mutate user-local Pi resources under `~/.pi/agent/...` unless the user explicitly asks for that edit.
- Do not promote CMUX, `gh-pr`, `stack-latest`, or other user-local workflows into `ts/packages/pi-extensions/` as a default. Complexity alone is not a promotion criterion, and CMUX remains personal/tool-stack-specific by current decision.
- Do not redesign Pi core, Codex, Claude, their resource discovery systems, or the Objective system.
- Do not create a hidden registry, YAML database, or state machine for harness resources. Policy and dispositions should be recorded in Markdown and validated through actual discovery evidence.
- Do not remove useful repo workflows merely to reduce command count; cleanup should improve clarity, safety, portability, and ownership.
- Do not require every capability to have identical UX in Pi, Codex, and Claude. It is acceptable for Pi to have a slash-command wrapper while Codex and Claude use a skill or documented CLI workflow, as long as the relationship is explicit.

## Completion Criteria

This Objective can close when all of the following are true:

- The final command/resource-surface policy and important dispositions are recorded in checked-in docs, either in `docs/pi/README.md` with clear cross-harness framing or in an adjacent harness-neutral agent doc linked from the Pi docs.
- The docs identify the boundary between checked-in repo resources, remote/vendored skills, and user-local personal resources.
- The docs identify the first-class target harnesses, currently Pi, Codex, and Claude, and describe each harness's primary repo-owned entrypoint surface.
- For each closure-critical capability touched by this Objective, the disposition names the portable core, the Pi entrypoint, the Codex path, and the Claude path, or explicitly records why the capability is intentionally harness-specific.
- The remote-skill runtime policy is explicitly decided and documented for `.agents/skills/` and `.claude/skills/`; any implementation required by that decision is complete, or removal is explicitly declared unnecessary.
- Low-risk checked-in metadata cleanup has either been completed or deliberately rejected with rationale, including local command-skill descriptions and distinct status command descriptions.
- The duplicate `/objective-stack-impl` visible Pi surface has been resolved or intentionally retained with a clear documented rationale that avoids autocomplete/entrypoint confusion, and Codex/Claude retain a documented way to invoke or follow the same Objective-stack implementation capability.
- `/land` has a recorded disposition appropriate to its risk as a mutating GitHub command: promoted and tested, deprecated/replaced, or retained with explicit rationale, safety expectations, and Codex/Claude guidance.
- User-local CMUX/`gh-pr`/`stack-latest` findings are captured as advisory/personal-resource context rather than closure-critical repo work, unless a later explicit user request changes scope.
- A fresh Pi RPC command inventory has been run after material changes and summarized in either docs or an Objective update.
- A fresh skill/instruction-surface inventory for Codex/Claude-relevant checked-in resources has been run after material changes and summarized in either docs or an Objective update.
- Relevant validation has passed for touched areas, such as `just ts-check`/`just ts-test` for TypeScript extension changes and formatter/lint checks for edited docs or skills.
- Meaningful decisions, assumptions, risks, and completion evidence have been recorded through Objective updates when they occur.

## Assumptions and Risks

Assumptions:

- The earlier Pi-specific framing was too narrow: Pi RPC command discovery is the right source of truth for Pi's visible command surface, but not for Codex or Claude capability coverage.
- Repo-owned skills under `skills/<name>/SKILL.md`, surfaced through `.agents/skills/` and `.claude/skills/`, are the best first portable workflow layer for Codex and Claude.
- `AGENTS.md` and `CLAUDE.md` are important harness instruction surfaces, but they should route to skills, docs, and CLIs rather than duplicate long workflow bodies.
- `docs/pi/README.md` remains the right place for the current resource-surface policy because it already describes project-local extensions, the vibecoded-vs-engineered layers, and now the Pi/Codex/Claude relationship for Objective stack implementation.
- Namespaced Pi extension commands using `/namespace:command` are a good fit for command families with portable skill counterparts, because Pi can keep a concise picker wrapper without colliding visually with `/skill:<name>` entries.
- A staged cleanup Objective is still better than several small Objectives because the findings are linked by one surface-area policy question.
- Remote GitHub-sourced skills can remain excluded from deep audit and remain live by default when documented as vendored/developer-aid runtime surface rather than repo-owned products.
- Treating user-local CMUX and similar commands as personal/tool-stack-specific avoids over-generalizing workflows that depend on a narrow local environment.
- Checked-in repo changes are the right closure-critical implementation unit; user-local changes are harder to review and reproduce.

Risks:

- The Objective stack implementation rename/prompt-removal risk is de-risked by checked-in evidence: the portable workflow now lives in `skills/objective-stack-impl/SKILL.md`, Pi exposes the picker wrapper as `/objective:stack-impl`, and RPC inventory shows no remaining `objective-stack-impl` top-level prompt command.
- Over-correcting for harness neutrality could turn concise Pi commands into over-abstracted, harder-to-use workflows; the namespaced wrapper pattern is the current mitigation for Pi command families.
- Keeping Pi-only implementations for mutating capabilities such as `/land` without Codex/Claude guidance could leave non-Pi agents to improvise unsafe GitHub operations.
- Remote skills remain visible by explicit policy: real-directory `.agents/skills/` entries are live developer aids, excluded from deep audit, and not removed or disabled without explicit skill-management work.
- `/land` mutates GitHub state, so refactoring it without tests or preserving safety checks could increase operational risk.
- Documentation-only dispositions can drift from actual Pi, Codex, and Claude surfaces unless the work ends with fresh discovery/inventory evidence.
- Because user-local resources are outside the repo, audit findings about them can become stale or machine-specific.

## Open Questions

- Should `/land` be promoted into a tested CLI/package path shared by Pi, Codex, and Claude, deprecated in favor of `/land-stack` plus non-Pi guidance, or retained as a small explicit Pi command with tests or rationale?
- Is the current `AGENTS.md` plus `skills/<name>` surface sufficient for Codex, or should this repo add a dedicated Codex-specific checked-in resource if a concrete gap appears?
