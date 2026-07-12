# Cmux Observational Skills

Shared conventions for the `ns-cmux-*` skill family: the read-only posture the observational skills (`ns-cmux-stack-map`, `ns-cmux-available-work`) follow, and the badge vocabulary shared across the family (including `ns-cmux-branch-triage`). Each skill owns its own rendering and workflow and points here for the shared meanings.

## Read-only posture

For observational cmux skills, collect and report evidence without mutating live session state.

Do not, unless the user separately asks for a follow-up mutation:

- change cmux focus, workspace/surface names, lifecycle, or pane input;
- mutate Git or Graphite state;
- edit local files or durable agent state such as Objective records, Branch Memory, handoffs, or branch-context attachments;
- call write-capable GitHub operations.

If the user asks for cleanup or continuation after the report, treat it as a separate follow-up task with the appropriate skill.

## Shared badge meanings

Family skills render these meanings in their own notation (glyphs in `ns-cmux-stack-map`, words in `ns-cmux-branch-triage`); the meanings are defined once here:

- **active** — the cmux active/focused workspace, from `tree.active.workspace_ref` in `cmux tree --all --json`.
- **caller** — the workspace this Pi session runs in, from `tree.caller.workspace_ref`.
- **open** — an open, inactive cmux workspace.
- **DIRTY** — `git status --porcelain` in the workspace current directory is non-empty.
- **↯label** — label drift: neither the workspace title nor the workspace description contains the checked-out branch name, using simple case-sensitive substring matching. If the workspace is detached, skip label-drift unless the detached display string is obviously present or missing in labels. Workspace titles and descriptions are labels that may drift, never identity.
- **dup** — two or more cmux workspaces point at the same `(cwd, branch)` pair.
- **DETACHED@<short-sha>** — the workspace checkout is a detached HEAD; render from `git -C <cwd> rev-parse --short HEAD`. Dirty detached workspaces are high risk.
