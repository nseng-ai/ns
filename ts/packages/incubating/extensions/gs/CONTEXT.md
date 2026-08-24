# gs context

This context names the current-worktree inventory and provider-worktree boundary exposed by the gs ns extension.

## Language

**Current-worktree gh-stack inventory**:
The collection of Recorded stacks read from the invoking worktree's provider state that have at least one recorded stack branch present as a repository-shared local Git branch. It is one provider-worktree view, not a repository aggregate or evidence of current GitHub state.
*Avoid*: Local gh-stack inventory, active stack inventory, repository inventory, remote inventory, reconciled inventory

**Provider worktree provenance**:
The canonical worktree Git directory derived from Git's absolute `--git-path gh-stack` result and returned as `providerWorktreeGitDir`. It identifies the private provider view inspected by `ns gs list`, including when that view has no state file. It does not establish lifecycle ownership, branch occupancy, or agreement with peer worktrees.
*Avoid*: repository root, Git common directory, stack owner, shared provider state

**Recorded stack**:
One stack entry preserved from current-worktree gh-stack state. A Recorded stack remains in the Current-worktree gh-stack inventory while at least one of its recorded stack branches exists as a repository-shared local branch; its complete recorded branch shape is preserved even when some branches were deleted. The base branch alone does not retain it.
*Avoid*: active stack, deduplicated stack

**Recorded PR**:
Pull-request identity stored on a recorded branch by gh-stack. Its presence does not establish the pull request's current GitHub state.
*Avoid*: open PR, current PR

**Recorded merged**:
The merged flag stored with a Recorded PR, defaulting to false when the provider omitted it. It describes recorded local evidence, not a live GitHub query.
*Avoid*: merged on GitHub, current merged state

**No PR recorded**:
A recorded branch with no local pull-request identity. It makes no claim about whether a pull request exists on GitHub.
*Avoid*: unpushed, no PR exists

**GS command face**:
The provider-branded `ns gs` command group. Its `list` operation exposes the Current-worktree gh-stack inventory with Provider worktree provenance; its `restack-resolve` operation starts or advances one local provider restack step. The latter has a thin `/ns:gs:restack-resolve` Pi mirror through the separate GS Pi restack router.
*Avoid*: `ns flow gs`, generic stack command

**Restack start**:
One authorized `gh stack rebase --no-trunk` invocation, optionally scoped downstack. It requires exact provider version 0.1.0, a clean worktree, a named branch, and no active Git operation.
*Avoid*: sync, trunk update, restack transaction

**Conflict stop**:
A restack outcome where Git still has an active rebase and bounded unresolved paths after provider advancement. It is durable forward-recovery state, not command failure to roll back automatically.
*Avoid*: failed transaction, automatic abort

**Restack continuation**:
One authorized `gh stack rebase --continue` invocation after all conflicts are resolved and at least one resolution is staged. The command infers it from Git state; it is not a public flag.
*Avoid*: raw Git continuation, `--continue` option

**Observed restack completion**:
A provider advancement followed by minimal Git state showing no active operation and a clean worktree. It does not claim topology, ancestry, range, remote, or GitHub reconciliation.
*Avoid*: verified stack transaction, reconciled stack

**Restack recovery action**:
The bounded, kebab-case machine action and concise instruction returned with every outcome. Human rendering places it last.
*Avoid*: postcondition array, recovery plan

**GS command-surface descriptor**:
The minimal stable metadata and strict Clinkr envelope schema exported only through `@nseng-ai/gs/api` for host adapters. It exposes command identity and result interpretation, not private orchestration.
*Avoid*: orchestration API, root export, Pi policy

**Current-worktree-only inventory**:
The command contract that asks Git for the invoking worktree's `--git-path gh-stack`, consumes exactly that private state file, and checks repository-shared local Git branch refs. It does not enumerate or merge peer worktree state and does not require provider installation, GitHub authentication, or network access.
*Avoid*: Local-only inventory, common-directory inventory, repository-wide inventory, fallback mode, partial remote inventory
