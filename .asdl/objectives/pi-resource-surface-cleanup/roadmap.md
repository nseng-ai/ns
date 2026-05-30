# Roadmap

## Work

- [ ] Resolve and record the first implementation slice ordering from the audit candidates: metadata/docs cleanup, duplicate `/objective-stack-impl` resolution, or `/land` hardening.
- [ ] Update `docs/pi/README.md` or an adjacent checked-in Pi doc with the final resource-surface policy, inventory/disposition table, remote-skill policy, and user-local boundary.
- [ ] Clean low-risk checked-in metadata, including local command-skill descriptions and distinct descriptions for `worktree-status`, `brmem-status`, and `gt-status`.
- [ ] Resolve the duplicate `/objective-stack-impl` visible surface so the public entrypoint and internal prompt asset relationship are clear.
- [ ] Decide and record the runtime policy for GitHub-sourced remote skills that are visible under `.agents/skills/` but excluded from deep review; implement only the changes required by that policy.
- [ ] Decide `/land` disposition and apply the chosen path: promote/test, deprecate/replace, or retain with explicit safety rationale.
- [ ] Re-run Pi RPC command inventory after material changes and record the resulting command/resource surface as closure evidence.
- [ ] Run relevant validation for touched areas and record pass/fail evidence in an Objective update.

## Parked

- [ ] User-local CMUX command implementation changes are parked unless explicitly requested; CMUX is personal/tool-stack-specific and should not be generalized by default.
- [ ] User-local `gh-pr` and `stack-latest` implementation changes are advisory/explicit-only, not closure-critical repo work.
- [ ] Deep review or rewrite of GitHub-sourced remote skills is out of scope unless separately requested.
- [ ] Promotion of user-local extensions into `ts/packages/pi-extensions/` is out of scope by current decision.
