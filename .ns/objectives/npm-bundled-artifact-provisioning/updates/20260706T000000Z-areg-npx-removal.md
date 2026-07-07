# Semantic Update: AREG npx wrapping removed

AREG no longer wraps `npx skills` acquisition or materialization flows. The removal is intentional and user-visible:

- `areg init` is removed as a whole command, including non-npx project scaffolding for `ns.toml`, managed instruction blocks, and Claude settings.
- `areg update-skills` is removed; skill-management guidance now uses targeted `npx skills add <source> --skill <name> --agent codex claude-code -y` commands for curated GitHub-sourced refreshes.
- `areg exec skillx parse|list|fetch|cleanup` is removed, and the first-party `skillx` repo skill is fully deleted from `skills/`, `.agents/skills/`, `.claude/skills/`, `.pi/settings.json`, and `skills-lock.json`.

Dead-code findings from the gateway chase:

- No retained AREG command calls the host tool-check seam after deleting `init`, `update-skills`, and `skillx`; `AregHostGateway`, `RealAregHostGateway`, `FakeAregHostGateway`, `AREG_HOST_TOOL_NAMES`, and `checkTool` were removed.
- The project mutation policy now has only `skill-kind`; the init-only mutation policy and init-only external mutation-operation type were removed. `project-mutations.ts` remains because retained `areg skill apply` uses it.
- `project-inspection.ts` keeps the retained inspection collectors; the init-only `inspectInitProject` path was removed.

AREG's surviving role is standalone whole-project inspection and invocation-kind reconciliation: `check`, `doctor skills`, and `skill find|list|show|apply`.
