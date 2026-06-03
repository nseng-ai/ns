# cmux CLI Reference for asdl-tools Agents

This note records the installed cmux CLI behavior that matters for repo-local Pi extensions and skills.
It is intentionally based on installed CLI help, not on local cmux source checkouts.

## Source of truth

Use the installed `cmux` CLI as the source of truth for implementation decisions:

```bash
cmux --help
cmux identify --json
cmux workspace --help
cmux workspace-action --help
cmux set-status --help
cmux list-status --help
cmux sidebar-state --workspace "$CMUX_WORKSPACE_ID"
```

Do not rely on `/Users/schrockn/code/githubs/manaflow-ai/cmux` unless that checkout has first been updated
and revalidated. It was explicitly called out as stale during the cmux workspace-summary work.

## Caller workspace, not focused workspace

cmux can distinguish the workspace that launched the terminal from the workspace currently focused in the UI.
Background Pi sessions may keep running after the user focuses another workspace, so cmux integrations must target
the caller workspace.

Preferred target resolution:

```bash
workspace="${CMUX_WORKSPACE_ID:-${CMUX_TAB_ID:-}}"
```

If neither variable is present, fail rather than guessing from the focused workspace. `cmux identify --json` is useful
for diagnostics because it reports both `caller` and `focused` refs, but caller environment variables remain the
normal targeting mechanism.

## Workspace title

Use the canonical workspace noun command:

```bash
cmux workspace rename "$workspace" --title "$title"
```

Avoid the legacy alias in new code:

```bash
cmux rename-workspace --workspace "$workspace" -- "$title"
```

The alias still works, but it prints a deprecation notice unless `CMUX_QUIET=1` is set.

## Workspace description

Use `workspace-action set-description`:

```bash
cmux workspace-action \
  --workspace "$workspace" \
  --action set-description \
  --description "$description"
```

Multi-line descriptions are accepted. Build them with `printf` or from a typed command implementation, not by
embedding unescaped prose in a shell command line.

Current workspace-summary description shape:

```text
Goal: <goal>
State: <current state>
Next: <next action>
```

## Sidebar status pills

Use `cmux set-status` with a stable key so one tool can update its own pill:

```bash
cmux set-status pi-summary "$status" \
  --workspace "$workspace" \
  --icon sparkle \
  --color '#7c3aed' \
  --priority 80
```

Useful companion commands:

```bash
cmux list-status --workspace "$workspace"
cmux clear-status pi-summary --workspace "$workspace"
```

The workspace-summary convention in this repo is:

| Field    | Value        |
| -------- | ------------ |
| key      | `pi-summary` |
| icon     | `sparkle`    |
| color    | `#7c3aed`    |
| priority | `80`         |

## Repo-local exec boundary

Agents and skills should prefer the tested repo CLI boundary over raw cmux shell snippets:

```bash
asdl exec cmux-workspace-summary \
  --workspace "$workspace" \
  --title "$title" \
  --goal "$goal" \
  --current-state "$current_state" \
  --next-action "$next_action" \
  --status "$status" \
  --format json
```

See [`../asdl-exec/cmux-workspace-summary.md`](../asdl-exec/cmux-workspace-summary.md) for the command contract.

## Verification and rollback

Inspect current sidebar state:

```bash
cmux sidebar-state --workspace "$CMUX_WORKSPACE_ID"
cmux list-status --workspace "$CMUX_WORKSPACE_ID"
```

Rollback description/status if needed:

```bash
cmux workspace-action --workspace "$CMUX_WORKSPACE_ID" --action clear-description
cmux clear-status pi-summary --workspace "$CMUX_WORKSPACE_ID"
```

Only rename back if the previous title was recorded.
