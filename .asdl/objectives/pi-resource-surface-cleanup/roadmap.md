# Roadmap

## Work

- [x] Resolve and record the first implementation slice ordering from the audit candidates: metadata/docs cleanup first, then duplicate `/objective-stack-impl`, then `/land` hardening/disposition.
- [x] Reframe the Objective from Pi-only surface cleanup into harness-neutral agent-resource cleanup targeting Pi, Codex, and Claude first.
- [x] Update `docs/pi/README.md` or an adjacent checked-in harness-neutral agent doc with the final resource-surface policy, inventory/disposition table, remote-skill policy, and user-local boundary; policy, remote-skill decision, user-local boundary, Pi extension namespace convention, Objective stack Pi/Codex/Claude disposition, `/gh:land` disposition, and Pi-only `/gt:land-stack` caveat are recorded.
- [x] Inventory the current Pi, Codex, and Claude repo-owned entrypoint surfaces after the harness-neutral reframe: Pi RPC commands, `skills/<name>` frontmatter and symlink provenance, `.agents/skills/`, `.claude/skills/`, `AGENTS.md`, and `CLAUDE.md`.
- [x] Define the per-capability disposition format for closure-critical agent workflows: portable core, Pi entrypoint, Codex path, Claude path, safety/testing expectations, and harness-specific caveats; Objective stack implementation and GitHub/Graphite landing surfaces now follow this shape.
- [x] Clean low-risk checked-in metadata, including local command-skill descriptions and distinct descriptions for `worktree-status`, `brmem-status`, and `gt-status`.
- [x] Resolve the duplicate `/objective-stack-impl` visible Pi surface so the public entrypoint and internal prompt asset relationship are clear, while preserving a Codex/Claude-usable Objective-stack implementation path; Pi now exposes `/objective:stack-impl`, Codex/Claude use `/skill:objective-stack-impl`, and no project prompt template duplicate remains.
- [x] Decide and record the runtime policy for GitHub-sourced remote skills that are visible under `.agents/skills/` and `.claude/skills/` but excluded from deep review; keep them live by default as vendored/developer-aid runtime surface, with no implementation change required.
- [x] Decide `/land` disposition and apply the chosen path: promote the GitHub single-PR landing behavior into package-tested `/gh:land`, remove the legacy `/land` alias, rename Graphite stack landing to Pi-only `/gt:land-stack`, and document Codex/Claude GitHub guidance plus no claimed non-Pi stack-landing workflow.
- [x] Consolidate the local development/source-control Pi command cluster under the locked `/dev:*` namespace: `/dev:cp`, `/dev:autobranch`, `/dev:submit`, `/dev:land`, and `/dev:land-stack` replace `/cp`, `/newbr`, `/submit`, `/gh:land`, and `/gt:land-stack` without legacy aliases.
- [ ] Categorize the remaining repo-owned workflow command families before closure: planned branches (`/write-plan`, `/create-planned-branch`, `/impl-planned-branch`), Branch Memory handoffs (`/brmem-handoff`, `/brmem-pickup-handoff`), and branch retrospectives / `aretro` (`/skill:branch-retro` and related evidence-collection surfaces). Decide whether each family should be renamed, namespaced, retained as-is, or documented as intentionally skill/CLI-centered.
- [x] Update package registration tests, project-local Pi adapters, docs, and user-facing rerun strings for the `/dev:*` command names, with no unintended legacy aliases.
- [x] Re-run Pi RPC command inventory after material changes and record the resulting command/resource surface as closure evidence; latest inventory after the `/dev:*` migration reports 71 commands total, 17 project extension commands, includes `/dev:cp`, `/dev:autobranch`, `/dev:submit`, `/dev:land`, and `/dev:land-stack`, and reports no legacy `/cp`, `/newbr`, `/submit`, `/gh:land`, `/gt:land-stack`, `/land`, or `/land-stack` commands.
- [x] Re-run Codex/Claude-relevant skill and instruction inventory after material changes and record the resulting checked-in agent surface as closure evidence; `skills/`, `.agents/skills/`, and `.claude/skills/` all expose `objective-stack-impl`, and `AGENTS.md` plus `CLAUDE.md` remain present as instruction surfaces.
- [x] Run relevant validation for touched areas and record pass/fail evidence in an Objective update; focused landing tests, `just ts-check`, `just ts-test`, `just dprint-check`, and `git diff --check` passed for the final landing-surface slice.
- [x] Re-run fresh Pi RPC command inventory after the `/dev:*` namespace migration and record the resulting visible command surface.
- [x] Re-run focused tests plus `just ts-check`, `just ts-test`, `just dprint-check`, and `git diff --check` after the new command-surface slice.

## Parked

- [ ] User-local CMUX command implementation changes are parked unless explicitly requested; CMUX is personal/tool-stack-specific and should not be generalized by default.
- [ ] User-local `gh-pr` and `stack-latest` implementation changes are advisory/explicit-only, not closure-critical repo work.
- [ ] Deep review or rewrite of GitHub-sourced remote skills is out of scope unless separately requested.
- [ ] Promotion of user-local extensions into `ts/packages/pi-extensions/` is out of scope by current decision.
- [ ] Dedicated Codex-specific checked-in configuration is parked unless the cross-harness inventory finds a concrete Codex gap that `AGENTS.md`, `skills/<name>`, and CLI/docs workflows cannot cover.
- [ ] Renaming existing `dev-` prefixed skills (`dev-checkpoint`, `dev-gh`, `dev-gh-ci-debug`, `dev-gt-restack-resolve`, `dev-gt-stackify-branch`, `dev-just-fix`, `dev-stacker-agent`) is parked; using `/dev:*` for Pi commands should not block on that separate convention change.
