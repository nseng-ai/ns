# Querying cmux Help for asdl-tools Agents

cmux is changing quickly. Treat installed cmux help output as the working source of truth for repo-local
integrations, not this document and not a local source checkout.

This guide explains how to query the live cmux command surface before writing or changing Pi extensions, skills, or
`asdl exec` commands.

## What not to trust

Do not rely on a local cmux source checkout for behavior unless that checkout has first been updated and revalidated.
A previously inspected checkout was stale during the cmux workspace-summary work.

Do not copy old cmux command shapes from prior plans or transcripts without checking the installed CLI again. Legacy
aliases may keep working while printing warnings, and canonical command forms may move.

## Start with the installed CLI

Run the broad help first:

```bash
cmux --help
```

Then use `rg` to find the relevant command family without reading the whole output:

```bash
cmux --help | rg 'workspace|status|sidebar|identify'
```

For workspace metadata work, usually inspect these surfaces:

```bash
cmux identify --json
cmux workspace --help
cmux workspace-action --help
cmux set-status --help
cmux list-status --help
cmux clear-status --help
cmux sidebar-state --help
```

If help mentions a nested command, query that nested command too:

```bash
cmux workspace rename --help
cmux workspace group --help
```

Some cmux subcommands show family help rather than subcommand-specific help. That is still useful evidence: record the
usage line and examples that the installed CLI prints.

## Capture caller/focused workspace evidence

cmux can distinguish the terminal's caller workspace from the currently focused workspace. Query both when targeting
matters:

```bash
cmux identify --json
printf 'CMUX_WORKSPACE_ID=%s\nCMUX_TAB_ID=%s\n' "${CMUX_WORKSPACE_ID:-}" "${CMUX_TAB_ID:-}"
```

Use caller environment variables for mutation targets:

```bash
workspace="${CMUX_WORKSPACE_ID:-${CMUX_TAB_ID:-}}"
```

If neither variable is present, fail rather than targeting the focused workspace. Background Pi sessions can continue
running while another cmux workspace is focused.

## Verify a command shape before encoding it

Before adding a command to a skill or gateway, confirm all required positional arguments and flags from help output.
For example, do not assume these flags exist without checking:

```bash
cmux workspace-action --help | rg 'set-description|--description|--workspace'
cmux set-status --help | rg '--workspace|--icon|--color|--priority'
cmux workspace --help | rg 'rename|--title'
```

Prefer canonical command families shown by current help. If help says a legacy command is an alias, use the canonical
form in new code so the command does not emit deprecation notices.

## Query state after applying changes

For manual smoke tests, inspect the resulting workspace metadata:

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

## Keep deterministic mutation behind `asdl exec`

For repo-local Pi skills and agents, prefer the tested `asdl exec` boundary over raw cmux shell snippets:

```bash
asdl exec cmux-workspace-summary --help
asdl exec cmux-workspace-summary --json-schema
```

The current workspace-summary command contract is documented in
[`../asdl-exec/cmux-workspace-summary.md`](../asdl-exec/cmux-workspace-summary.md). Its implementation should be
updated whenever live cmux help shows a better canonical command shape.

## What to put in future plans

When planning cmux work, include the exact help commands you ran and the facts you relied on. Keep facts concrete but
avoid presenting them as permanent API guarantees.

Good planning evidence:

```text
Ran `cmux set-status --help` on 2026-06-03. Installed help shows:
- usage: `cmux set-status <key> <value> [flags]`
- flags include `--workspace`, `--icon`, `--color`, `--priority`
```

Avoid vague evidence:

```text
cmux supports status pills.
```

Also avoid storing large pasted help output in skills. Skills should tell agents what to query and which command to run,
not preserve a stale manual for a fast-moving CLI.
