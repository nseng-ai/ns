# Cross-package duplication

Concepts reimplemented across packages that should live once in the shared layer.

## 1. [MED] Two git gateways, one a strict superset

Two real git gateways:

- `asdl-core/src/git/index.ts` — `RealGitGateway` (588 lines), canonical (used by
  plans, handoff, branch-context via their contexts).
- `brmem/src/real-git-gateway.ts` — `RealGitBrmemGateway` (671 lines), brmem's own.

brmem's gateway does genuinely brmem-specific plumbing (tree building,
`commit-tree`, ref updates, `ls-tree`, snapshot enumeration) the core gateway
lacks — so it can't be fully collapsed. But the generic primitives are duplicated
verbatim:

- `runGit` helper: `real-git-gateway.ts:558-573` vs core `index.ts:457-470` (both
  wrap `commands.exec("git", …)` + `formatCommand`).
- `currentBranch`: `real-git-gateway.ts:59-70` re-implements `branch
  --show-current` + detached-head detection that core provides (`index.ts:154-176`).
- `check-ref-format --branch` validation: `real-git-gateway.ts:341-353`
  duplicates core `validateBranchRef` (`index.ts:306-316`).
- Empty/non-empty line splitting, command-message formatting.

Remedy: brmem composes the core `GitGateway` for generic facts (current branch,
ref-format validation, repo root) and keeps only the brmem-specific
object-plumbing (`hash-object`, `commit-tree`, `update-ref`, `ls-tree`, snapshot
enumeration) in its own module. Removes the second `runGit`/`currentBranch`/
branch-validation copy and shrinks the 671-line file toward its unique core.

## 2. [MED] Branch-name validation exists in three places with three behaviors

1. `brmem/src/validation.ts:46-51` `validateBranchName` — minimal: non-empty +
   reject `---` (a brmem-encoding constraint). Exported from `@asdl/brmem` and
   reused by handoff (`handoff/src/operations/shared.ts:1`). Good reuse.
2. `branch-context/src/branch-context-creation.ts:257-297`
   `validateTargetBranchName` — a full 40-line git-ref-rules reimplementation
   (control chars, `..`, `@{`, metacharacters, `.lock` segments). Duplicates
   git's own `check-ref-format` — and branch-context *also* calls
   `git.validateBranchRef` (`:299-309`) right after, so the hand-rolled validator
   is largely redundant with the git call it precedes.
3. Core `RealGitGateway.validateBranchRef` (`index.ts:306-316`) — defers to git.

Remedy: collapse to one. branch-context's `validateTargetBranchName` should be
deleted in favor of `git.validateBranchRef`, or — if a pure-function pre-check is
wanted — moved to `@asdl/brmem` (or asdl-core) as the single canonical
branch-name validator. Today a branch name's acceptability depends on which
package you entered through.

## 3. [LOW-MED] "default to current branch (or fail on detached HEAD)" reimplemented 4×

Same resolve-branch-or-default dance, each slightly different:

- `brmem/src/operations/shared.ts:20-45` (`resolveEntryRequest` /
  `resolveCurrentBranch`)
- `handoff/src/operations/shared.ts:11-37` (`resolveBranch`)
- `branch-context/src/attach.ts:305-321` (`resolveAttachBranch`)
- `branch-context/src/attached-plan.ts:295-330` (`resolveSafeImplementationBranch`,
  a trunk-guarded variant)

All do: requested branch ? validate : `git.currentBranch()` →
branch | detached-error | failure. Four copies, four bespoke error strings.

Remedy: one shared `resolveBranchOrCurrent(git, {cwd, requested, detachedMessage,
signal})` in asdl-core (it already owns `GitGateway` and
`GitCurrentBranchResult`). The trunk-refusal in `resolveSafeImplementationBranch`
is a legitimate branch-context-specific layer on top, not a reason to fork the
base.

## 4. [HIGH] roaster reimplements GitHub-JSON leaf helpers asdl-core owns, with divergent id policy

- `roaster/src/gateways/github.ts:16-20` redefines `ghAuthorSchema` byte-for-byte
  identical to `asdl-core/src/github-pr-feedback/schemas.ts:15`.
- `roaster/.../github.ts:412-415` redefines `normalizeAuthor` identical to
  `normalizers.ts:81`.
- `roaster/.../github.ts:36-44,417-434` redefines `ghDiscussionCommentSchema` +
  a `numericId` that *diverges* from core's `numericGithubIdentity`
  (`schemas.ts:185`): roaster's `numericId` returns `0` for a bad id then filters
  `comment.id !== 0` downstream (`:232`), whereas core *rejects* non-positive ids.
  Two "GitHub numeric identity" policies that will drift.

The helpers are currently unreachable for reuse because
`github-pr-feedback/index.ts` exports only the gateway + types.

Remedy: add `ghAuthorSchema`, `normalizeAuthor`, `numericGithubIdentity` to the
`@asdl/core/github-pr-feedback` barrel and delete roaster's local copies (a
one-line asdl-core export change plus three deletions). Do NOT collapse the
gateways: roaster's gateway interface (`getPrChangedFiles`, `createPrReview`,
marker lookup, REST `pulls/{n}/files`) is a genuinely different surface from
core's GraphQL `GithubPrFeedbackGateway` — only the leaf helpers are shareable.

Related (MED): `roaster/.../github.ts:391-408` hand-rolls a
JSON.parse→zod→prettified-error-Result `parseJson` that duplicates
`asdl-core/src/github-pr-feedback/parsing.ts:11` (built on `parseJsonUnknown`,
`github-graphql-json.ts:18`). At minimum reuse `parseJsonUnknown`; ideally factor
a Result-returning gh-JSON parse helper parameterized over the failure
constructor (core's is bound to `GithubPrFeedbackFailure`, roaster returns
`RoasterResult`, so not a literal swap).
