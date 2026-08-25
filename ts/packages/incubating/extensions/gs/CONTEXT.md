# gs context

This context names the gh-stack workflows exposed by the GS ns extension.

## Language

**GS**:
The ns extension for the [`github/gh-stack`](https://github.com/github/gh-stack) tool. In this context, GS means gh-stack and does not name a generic stack-tool abstraction.
*Avoid*: generic stack backend

**Local gh-stack inventory**:
The collection of Recorded stacks that have at least one recorded stack branch present as a local Git branch. It is evidence of what the repository knows locally, not evidence of current GitHub state.
*Avoid*: active stack inventory, remote inventory, reconciled inventory

**Recorded stack**:
One stack entry preserved from local gh-stack state. A Recorded stack remains in the Local gh-stack inventory while at least one of its recorded stack branches exists locally; its complete recorded branch shape is preserved even when some branches were deleted. The base branch alone does not retain it.
*Avoid*: active stack, deduplicated stack

**Recorded PR**:
Pull-request identity stored on a recorded branch by gh-stack. Its presence does not establish the pull request's current GitHub state.
*Avoid*: open PR, current PR

**Recorded merged**:
The merged flag stored with a Recorded PR, defaulting to false when gh-stack omitted it. It describes recorded local evidence, not a live GitHub query.
*Avoid*: merged on GitHub, current merged state

**No PR recorded**:
A recorded branch with no local pull-request identity. It makes no claim about whether a pull request exists on GitHub.
*Avoid*: unpushed, no PR exists

**GS command face**:
The gh-stack-native `ns gs` command group. Its `list` operation exposes the Local gh-stack inventory; its `restack-resolve` operation starts or advances one local gh-stack restack step. The latter has a thin `/ns:gs:restack-resolve` Pi mirror through the separate GS Pi restack router.
*Avoid*: `ns flow gs`, generic stack command

**Restack start**:
One authorized `gh stack rebase --no-trunk` invocation, scoped downstack by default and widened to full inter-branch scope only by explicit `--full`. It requires exact gh-stack version 0.1.0, a clean worktree, a named branch, and no active Git operation.
*Avoid*: sync, trunk update, restack transaction

**Conflict stop**:
A restack outcome where Git still has an active rebase and bounded unresolved paths after gh-stack advancement. It is durable forward-recovery state, not command failure to roll back automatically.
*Avoid*: failed transaction, automatic abort

**Restack continuation**:
One authorized `gh stack rebase --continue` invocation after all conflicts are resolved and at least one resolution is staged. The command infers it from Git state; it is not a public flag.
*Avoid*: raw Git continuation, `--continue` option

**Observed restack completion**:
A gh-stack advancement followed by minimal Git state showing no active operation and a clean worktree. It does not claim topology, ancestry, range, remote, or GitHub reconciliation.
*Avoid*: verified stack transaction, reconciled stack

**Restack recovery action**:
The bounded, kebab-case machine action and concise instruction returned with every outcome. Human rendering places it last.
*Avoid*: postcondition array, recovery plan

**GS command-surface descriptor**:
The minimal stable metadata and strict Clinkr envelope schema exported only through `@nseng-ai/gs/api` for host adapters. It exposes command identity and result interpretation, not private orchestration.
*Avoid*: orchestration API, root export, Pi policy

**Local-only inventory**:
The command contract that resolves Git's common directory, consumes gh-stack's local state file, and checks local Git branch refs. It does not require gh-stack installation, GitHub authentication, or network access.
*Avoid*: fallback mode, partial remote inventory
