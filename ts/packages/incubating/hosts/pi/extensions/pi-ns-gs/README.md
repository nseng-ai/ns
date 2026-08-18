# @nseng-ai/pi-ns-gs

Pi integration for creating a GitHub Stacks branch from a Saved Plan and attaching it as Branch Context.

## Command

- `/ns:gs:new-branch-from-plan [--dry-run] [--branch <name>] [saved-plan.md]`
- `/ns:gs:impl-branch-from-plan [--dry-run] [--branch <name>] [saved-plan.md]`

Both commands inspect local topology with `gh stack view --json` only after resolving a Saved Plan. The adapter adds the target above an existing stack, initializes from trunk, or adopts an unstacked non-trunk branch as the bottom layer. After verified creation and attachment, `new-branch-from-plan` restores the branch on which it started. `impl-branch-from-plan` requires a Saved Plan, keeps the newly created target checked out, starts a fresh Pi session with parent-session evidence, and dispatches the exact Attached Plan implementation command. If no Saved Plan is available, it fails before topology inspection, provider calls, Git mutation, Branch Memory writes, checkout, or session replacement; recover by checking out an existing implementation branch and running `/ns:branch-context:impl-attached-plan [<key>]`.

This package does not publish, sync, merge, or open pull requests.
