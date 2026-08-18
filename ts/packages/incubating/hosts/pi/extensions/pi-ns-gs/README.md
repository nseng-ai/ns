# @nseng-ai/pi-ns-gs

Pi integration for creating a GitHub Stacks branch from a Saved Plan and attaching it as Branch Context.

## Command

- `/ns:gs:branch-from-plan [--dry-run] [--branch <name>] [saved-plan.md]`
- `/ns:gs:branch-and-impl-from-plan [--dry-run] [--branch <name>] [saved-plan.md]`

Both commands inspect local topology with `gh stack view --json`. It adds the target above an existing stack, initializes from trunk, or adopts an unstacked non-trunk branch as the bottom layer. After verified creation and attachment, `branch-from-plan` restores the branch on which it started. `branch-and-impl-from-plan` keeps the target checked out, starts a fresh Pi session with parent-session evidence, and dispatches the exact Attached Plan implementation command. When no Saved Plan is available, it can reuse one unambiguously verified Attached Plan without invoking GitHub Stacks.

This package does not publish, sync, merge, or open pull requests.
