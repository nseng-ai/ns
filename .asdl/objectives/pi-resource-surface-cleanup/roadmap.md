# Roadmap

## Work

- [x] Resolve and record the first implementation slice ordering from the audit candidates: metadata/docs cleanup first, then duplicate `/objective-stack-impl`, then `/land` hardening/disposition.
- [x] Reframe the Objective from Pi-only surface cleanup into harness-neutral agent-resource cleanup targeting Pi, Codex, and Claude first.
- [~] Update `docs/pi/README.md` or an adjacent checked-in harness-neutral agent doc with the final resource-surface policy, inventory/disposition table, remote-skill policy, and user-local boundary; policy, remote-skill decision, and user-local boundary are recorded for Pi, while cross-harness Pi/Codex/Claude framing and final `/objective-stack-impl` and `/land` dispositions remain pending.
- [ ] Inventory the current Pi, Codex, and Claude repo-owned entrypoint surfaces after the harness-neutral reframe: Pi RPC commands, `skills/<name>` frontmatter and symlink provenance, `.agents/skills/`, `.claude/skills/`, `AGENTS.md`, and `CLAUDE.md`.
- [ ] Define the per-capability disposition format for closure-critical agent workflows: portable core, Pi entrypoint, Codex path, Claude path, safety/testing expectations, and harness-specific caveats.
- [x] Clean low-risk checked-in metadata, including local command-skill descriptions and distinct descriptions for `worktree-status`, `brmem-status`, and `gt-status`.
- [ ] Resolve the duplicate `/objective-stack-impl` visible Pi surface so the public entrypoint and internal prompt asset relationship are clear, while preserving a Codex/Claude-usable Objective-stack implementation path.
- [x] Decide and record the runtime policy for GitHub-sourced remote skills that are visible under `.agents/skills/` and `.claude/skills/` but excluded from deep review; keep them live by default as vendored/developer-aid runtime surface, with no implementation change required.
- [ ] Decide `/land` disposition and apply the chosen path: promote/test, deprecate/replace, or retain with explicit safety rationale, including what Codex and Claude users should do instead of invoking a Pi-only slash command.
- [~] Re-run Pi RPC command inventory after material changes and record the resulting command/resource surface as closure evidence; the metadata/docs slice inventory still shows 74 commands and only the known `/objective-stack-impl` duplicate.
- [ ] Re-run Codex/Claude-relevant skill and instruction inventory after material changes and record the resulting checked-in agent surface as closure evidence.
- [~] Run relevant validation for touched areas and record pass/fail evidence in an Objective update; the metadata/docs slice passed focused docs and TypeScript validation, and later material changes should repeat relevant checks.

## Parked

- [ ] User-local CMUX command implementation changes are parked unless explicitly requested; CMUX is personal/tool-stack-specific and should not be generalized by default.
- [ ] User-local `gh-pr` and `stack-latest` implementation changes are advisory/explicit-only, not closure-critical repo work.
- [ ] Deep review or rewrite of GitHub-sourced remote skills is out of scope unless separately requested.
- [ ] Promotion of user-local extensions into `ts/packages/pi-extensions/` is out of scope by current decision.
- [ ] Dedicated Codex-specific checked-in configuration is parked unless the cross-harness inventory finds a concrete Codex gap that `AGENTS.md`, `skills/<name>`, and CLI/docs workflows cannot cover.
