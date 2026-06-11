---
name: code-workflows
description: "Command: code-workflows"
metadata:
  internal: true
allowed-tools:
  - "Bash(gt *)"
  - "Bash(git *)"
  - "Bash(gh *)"
  - "Bash(slot *)"
  - "Bash(uv run *)"
  - "Bash(just *)"
  - "Bash(make *)"
  - Read
  - Edit
  - Write
  - Grep
  - Glob
---

# code-workflows

Lazy-loading router for rare code workflows. This skill keeps the installed surface small; the full playbooks live in `references/` and are loaded only after a route is selected.

## Routing

- If the user gives a route or alias, read the mapped reference and follow it as the active playbook.
- If no route is supplied, show the menu below and ask which workflow to load.
- Treat old standalone skill names as aliases when the user mentions them explicitly; those workflows are no longer installed as separate skills.
- Resolve relative paths in loaded references from this router skill directory.

## Routes

| Route             | Aliases                | Reference                          |
| ----------------- | ---------------------- | ---------------------------------- |
| `delete-stack`    | `gt-delete-stack`      | `references/delete-stack.md`       |
| `stackify-branch` | `gt-stackify-branch`   | `references/gt-stackify-branch.md` |
| `stacker-agent`   | `stacker`              | `references/stacker-agent.md`      |
| `parity-review`   | `cross-harness-parity` | `references/parity-review.md`      |
| `stack-address`   | `pr-stack-address`     | `references/stack-address.md`      |
| `gh-ci-debug`     | `ci-debug`             | `references/gh-ci-debug.md`        |

## Menu prompt

When no route is specified, ask:

```text
Which code workflow should I load?
1. delete-stack — delete a Graphite subtree with slot/PR/remote cleanup
2. stackify-branch — split one branch into a clean Graphite stack
3. stacker-agent — serial multi-slice implementation coordinator
4. parity-review — review Pi command/tool changes for cross-harness parity
5. stack-address — address unresolved feedback across a Graphite PR stack
6. gh-ci-debug — diagnose a failing GitHub Actions run or PR check
```
