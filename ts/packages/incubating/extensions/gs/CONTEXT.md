# gs context

This context names the local-only inventory exposed by the gs ns extension.

## Language

**Local gh-stack inventory**:
The complete collection of stacks recorded in one repository's local gh-stack provider state. It is evidence of what the checkout knows locally, not evidence of current GitHub state.
*Avoid*: active stack inventory, remote inventory, reconciled inventory

**Recorded stack**:
One stack entry preserved from local gh-stack state, including fully merged entries and entries that repeat another stack number.
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
The provider-branded `ns gs` command group. Its `list` operation exposes the complete Local gh-stack inventory for humans and agents and has no Pi mirror.
*Avoid*: `ns flow gs`, generic stack command

**Local-only inventory**:
The command contract that resolves Git's common directory and consumes only gh-stack's local state file. It does not require provider installation, GitHub authentication, or network access.
*Avoid*: fallback mode, partial remote inventory
