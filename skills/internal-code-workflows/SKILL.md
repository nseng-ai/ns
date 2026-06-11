---
name: internal-code-workflows
description: "Command: internal-code-workflows"
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

# internal-code-workflows

Lazy-loading router for rare internal code workflows. This skill keeps the installed surface small; the full playbooks live in `references/` and are loaded only after a route is selected.

## Routing

- If the user gives a route or alias, read the mapped reference and follow it as the active playbook.
- If no route is supplied, show the menu below and ask which workflow to load.
- Treat old standalone skill names as aliases when the user mentions them explicitly; most are no longer installed as separate skills.
- Exception: `internal-pr-stack-address` is installed directly again. Prefer that standalone skill for stack-wide PR feedback work; this router keeps only a compatibility redirect.
- Resolve relative paths in loaded references from this router skill directory.

## Routes

| Route             | Aliases                                                  | Reference                                                               |
| ----------------- | -------------------------------------------------------- | ----------------------------------------------------------------------- |
| `delete-stack`    | `gt-delete-stack`, `internal-code-gt-delete-stack`       | `references/delete-stack.md`                                            |
| `stackify-branch` | `gt-stackify-branch`, `internal-code-gt-stackify-branch` | `references/gt-stackify-branch.md`                                      |
| `stacker-agent`   | `stacker`, `internal-code-stacker-agent`                 | `references/stacker-agent.md`                                           |
| `parity-review`   | `cross-harness-parity`, `internal-code-parity-review`    | `references/parity-review.md`                                           |
| `stack-address`   | `pr-stack-address`, `internal-pr-stack-address`          | `references/stack-address.md` (redirect to `internal-pr-stack-address`) |
| `gh-ci-debug`     | `ci-debug`, `internal-code-gh-ci-debug`                  | `references/gh-ci-debug.md`                                             |

## Menu prompt

When no route is specified, ask:

```text
Which internal code workflow should I load?
1. delete-stack — delete a Graphite subtree with slot/PR/remote cleanup
2. stackify-branch — split one branch into a clean Graphite stack
3. stacker-agent — serial multi-slice implementation coordinator
4. parity-review — review Pi command/tool changes for cross-harness parity
5. stack-address — address unresolved feedback across a Graphite PR stack
6. gh-ci-debug — diagnose a failing GitHub Actions run or PR check
```
