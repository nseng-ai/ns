# Pi Resource Surface Cleanup

## Thesis

Pi's visible command and resource surface in this repository should be intentional, legible, and small enough for agents and humans to navigate safely. The current surface is useful but uneven: a Pi RPC inventory found 74 visible slash commands, a duplicate `/objective-stack-impl` extension/prompt exposure, low-signal local skill descriptions, status commands with indistinct descriptions, GitHub-sourced remote skills that are live but intentionally excluded from deep audit, and several large user-local extensions that are personal tool-stack workflows rather than repo-general products.

This Objective turns that audit into staged cleanup and durable policy. The desired outcome is not to generalize every useful personal Pi workflow. The desired outcome is to clarify what belongs in the checked-in repo surface, document why, clean low-risk metadata and duplicate exposure, and make explicit dispositions for riskier commands such as `/land` without mutating user-local configuration unless the user explicitly asks.

## Scope

In scope:

- Checked-in project-local Pi resources under `.pi/extensions/`, `.pi/prompts/`, and `skills/<name>`.
- Engineered Pi extension code and tests under `ts/packages/pi-extensions/` when a checked-in extension behavior needs testing, promotion, or disposition.
- Repo-specific Pi documentation under `docs/pi/`, especially the current inventory and vibecoded-vs-engineered guidance in `docs/pi/README.md`.
- Pi RPC command inventory as the source of truth for the visible command surface during this work.
- Low-risk metadata cleanup, including local command-skill descriptions and distinct descriptions for related status commands.
- Resolution of the duplicate `/objective-stack-impl` surface, where the extension wrapper and prompt template currently expose the same command name.
- A documented runtime policy decision for GitHub-sourced `npx skills` / remote skills that are live under `.agents/skills/` but excluded from deep review.
- A disposition for checked-in risky or mutating commands, especially `/land`, such as promotion into tested package code, replacement/deprecation, or an explicit retained-as-is rationale.
- Audit narrative and advisory disposition for user-local resources such as CMUX slot commands, `gh-pr`, `stack-latest`, and user-local skills when they affect the visible Pi surface from this checkout.

Confirmed boundaries:

- User-local implementation changes under `~/.pi/agent/...` are advisory and explicit-request-only. Closure-critical implementation work should be checked into the repository unless a later user request explicitly changes that boundary.
- CMUX commands are tailored to a specific personal stack of tools. They should not be presented as generalized repo products merely because they are complex.
- Real-directory remote or vendored skills under `.agents/skills/` remain live by default as developer aids. Removal or disabling requires explicit skill-management work; no implementation change is required by this Objective's current remote-skill runtime policy.

## Non-Goals

- Do not deeply audit or rewrite GitHub-sourced remote skills that were excluded from the audit scope.
- Do not mutate user-local Pi resources under `~/.pi/agent/...` unless the user explicitly asks for that edit.
- Do not promote CMUX, `gh-pr`, `stack-latest`, or other user-local workflows into `ts/packages/pi-extensions/` as a default. Complexity alone is not a promotion criterion, and CMUX remains personal/tool-stack-specific by current decision.
- Do not redesign Pi core, Pi resource discovery, or the Objective system.
- Do not turn the Objective into a hidden registry or command database. Policy and dispositions should be recorded in Markdown and validated through Pi's actual command discovery.
- Do not remove useful repo workflows merely to reduce command count; cleanup should improve clarity, safety, and ownership.

## Completion Criteria

This Objective can close when all of the following are true:

- The final command/resource-surface policy and important dispositions are recorded in `docs/pi/README.md` or an adjacent checked-in Pi doc.
- The docs identify the boundary between checked-in repo resources, remote/vendored skills, and user-local personal resources.
- The remote-skill runtime policy is explicitly decided and documented; any implementation required by that decision is complete, or removal is explicitly declared unnecessary.
- Low-risk checked-in metadata cleanup has either been completed or deliberately rejected with rationale, including local command-skill descriptions and distinct status command descriptions.
- The duplicate `/objective-stack-impl` visible surface has been resolved or intentionally retained with a clear documented rationale that avoids autocomplete/entrypoint confusion.
- `/land` has a recorded disposition appropriate to its risk as a mutating GitHub command: promoted and tested, deprecated/replaced, or retained with explicit rationale and safety expectations.
- User-local CMUX/`gh-pr`/`stack-latest` findings are captured as advisory/personal-resource context rather than closure-critical repo work, unless a later explicit user request changes scope.
- A fresh Pi RPC command inventory has been run after material changes and summarized in either docs or an Objective update.
- Relevant validation has passed for touched areas, such as `just ts-check`/`just ts-test` for TypeScript extension changes and formatter/lint checks for edited docs or skills.
- Meaningful decisions, assumptions, risks, and completion evidence have been recorded through Objective updates when they occur.

## Assumptions and Risks

Assumptions:

- Pi RPC command discovery is the right source of truth for the visible extension, prompt-template, and skill command surface.
- `docs/pi/README.md` is the right first documentation surface for durable repo-specific Pi resource policy because it already describes project-local extensions and the vibecoded-vs-engineered layers.
- A staged cleanup Objective is better than several small Objectives because the findings are linked by one surface-area policy question.
- Remote GitHub-sourced skills can remain excluded from deep audit and remain live by default when documented as vendored/developer-aid runtime surface rather than repo-owned products.
- Treating user-local CMUX and similar commands as personal/tool-stack-specific avoids over-generalizing workflows that depend on a narrow local environment.
- Checked-in repo changes are the right closure-critical implementation unit; user-local changes are harder to review and reproduce.

Risks:

- Internalizing or renaming a prompt/command such as `/objective-stack-impl` could break muscle memory or hidden workflows if not documented.
- Remote skills remain visible by explicit policy: real-directory `.agents/skills/` entries are live developer aids, excluded from deep audit, and not removed or disabled without explicit skill-management work.
- `/land` mutates GitHub state, so refactoring it without tests or preserving safety checks could increase operational risk.
- Documentation-only dispositions can drift from the actual Pi surface unless the work ends with a fresh RPC inventory.
- Because user-local resources are outside the repo, audit findings about them can become stale or machine-specific.

## Open Questions

- Should the duplicate `/objective-stack-impl` prompt be moved to an internal asset, renamed as a raw/internal prompt, or kept visible with documented rationale?
- Should `/land` be promoted into `ts/packages/pi-extensions/`, deprecated in favor of `/land-stack`, or retained as a small explicit command with tests or rationale?
