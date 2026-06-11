<!-- Loaded through `code-workflows`. -->

# gt-stackify-branch

Use this skill when the user wants to turn one branch into a clean Graphite stack.

Typical trigger phrases:

- "split this branch into a 2 PR stack"
- "turn this branch into stacked PRs"
- "separate this mixed branch into reviewable PRs"
- "make this a Graphite stack"
- "pull the skills changes out into their own PR"

This skill is for the branch-splitting workflow itself. It does not replace Graphite; it wraps the
planning and reconstruction process around `gt`.

## Goal

Produce a stack that is:

- Ordered by dependency
- Reviewable one PR at a time
- Safe to validate incrementally
- Built without rewriting or deleting the original source branch

## Core Rules

- Preserve the original branch as a fallback unless the user explicitly asks to rewrite it.
- Do not touch unrelated dirty files in the worktree.
- Prefer more, smaller PRs over fewer, broader PRs when the boundaries are real.
- If the split boundary is ambiguous, show the proposed slices before changing branches.
- If a file mixes multiple concerns and cannot be cleanly split, stop and explain the blocker.

## Workflow

### 1. Inspect the current state

Start by understanding the existing branch and whether the worktree is safe to operate on.

Use:

```bash
git status --short --branch
git branch --show-current
git log --oneline --decorate --graph --max-count=25
gt ls
```

If the worktree contains unrelated changes, leave them alone. Only proceed if the files required for
the stack split can be handled without clobbering user work.

### 2. Detect the trunk branch

Do not assume `main` or `master`.

Prefer local information:

```bash
git symbolic-ref refs/remotes/origin/HEAD
git branch --list main master
```

Use the repo's real trunk branch as the base of the new stack.

### 3. Plan the slices

Compare the source branch to trunk and classify the changes into ordered PR slices.

Use:

```bash
git diff --name-status <trunk>...HEAD
git diff <trunk>...HEAD -- <path>
git show --stat <commit>
```

When planning slices:

- Group by semantic unit, not by commit count
- Put shared scaffolding, config, or migrations in the earliest possible PR
- Put domain logic after the prerequisites it needs
- Keep each PR independently understandable

If the existing commits already align to the desired split, prefer preserving them with
`cherry-pick`-style reconstruction. If commits mix concerns, reconstruct by checking out only the
needed files from the source branch into each new layer.

### 4. Preserve the source branch

Do not restack by destructively rewriting the source branch unless the user asks for that.

Preferred pattern:

1. Leave the original branch untouched
2. Check out trunk
3. Rebuild the stack on new branches

This gives a clean rollback path if the split plan is wrong.

### 5. Rebuild the stack from trunk

For each planned slice:

1. Start from the appropriate parent branch
2. Bring over only the files or hunks owned by that slice
3. Verify the staged diff matches the intended PR scope
4. Create the branch with `gt create <branch-name> -m "<commit message>"`

Naming convention:

```text
<topic>/<slice>
```

Examples:

```text
feature-core/skills-migration
feature-core/data-model
```

If Graphite reports that the current branch is untracked, track or re-parent it before continuing.

### 6. Validate the stack

After each meaningful layer, run the project checks that matter for that repo. Prefer validating the
full top of stack once the split is complete, and fix issues in the lowest branch that owns the
problem.

Typical checks:

```bash
make check
```

If validation fails:

- Fix the lowest branch responsible for the failure
- Amend that branch
- Restack if needed

### 7. Submit when appropriate

If the user asked for PRs, submit the stack after validation:

```bash
gt submit --no-interactive
gh pr view <number> --json url,title,number,headRefName,baseRefName
```

If the user only asked for a local split, stop after creating the stack and report the branch order.

## Expected Output

Report:

- The resulting branch order
- Which files belong to each PR
- Any assumptions made during the split
- Validation status
- PR links and base/head relationships if submitted

## Decision Heuristics

- Prefer file-level reconstruction over commit surgery when original commits are mixed.
- Prefer commit-preserving reconstruction when the existing history is already clean.
- The first PR should contain only prerequisites needed by later PRs.
- A later PR should not introduce setup or refactors that the earlier PR needed to stand alone.
- If the top PR is green but a lower PR is not independently coherent, the stack is still wrong.

## Anti-Patterns

- Rewriting or deleting the source branch by default
- Shoving unrelated changes into one "prep" PR
- Letting later PRs fix test failures introduced by earlier PRs
- Splitting by arbitrary line count instead of semantic boundaries
- Ignoring dirty user changes in the worktree
