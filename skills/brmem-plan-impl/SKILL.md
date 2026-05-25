---
name: brmem-plan-impl
description: Load a canonical Branch Memory plan from namespace brmem-plans on the current implementation branch and start implementing it.
allowed-tools:
  - "Bash(git rev-parse *)"
  - "Bash(git symbolic-ref *)"
  - "Bash(brmem list *)"
  - "Bash(brmem get *)"
  - "Read"
---

# brmem-plan-impl

Load the canonical Branch Memory plan attached to the current implementation
branch and begin implementation.

Use `/write-plan` followed by `/create-planned-branch` to create new planned
branches. This skill is read-only with respect to Branch Memory and is only for
picking up an existing attached plan.

## Rules

- **Read-only on Branch Memory.** Never call `brmem put`, `brmem copy`,
  `brmem delete`, or any other mutating Branch Memory command. If the loaded
  plan asks you to update Branch Memory, stop and ask the user.
- **Use only the canonical namespace.** Discover plans with
  `brmem list --namespace brmem-plans --branch <current-branch> --format json`.
- **Load one selected plan entry.** Read only the selected `<slug>.md` plan from
  namespace `brmem-plans` unless the user explicitly asks for additional Branch
  Memory context.
- **Refuse unsafe branches.** Abort on detached HEAD, `main`, `master`, or the
  repo's configured default branch.
- **Do not fabricate a plan.** If no suitable `brmem-plans` entry can be
  selected, stop and ask for the plan key or branch setup.
- **Keep the loaded plan authoritative.** Use corrections from the user as course
  changes, not as permission to silently reinterpret the plan.

## Workflow

### 1. Pre-flight current branch

Run:

```text
git rev-parse --show-toplevel
git symbolic-ref --short HEAD
```

Abort if either command shows the checkout is not a normal branch in a Git repo.
If detached HEAD is detected, stop before running any `brmem` command.

Determine the trunk/default branch with a best effort, for example:

```text
git symbolic-ref refs/remotes/origin/HEAD --short
```

Refuse to run if the current branch is `main`, `master`, or the configured
default branch. Say:

```text
Refusing to implement directly on trunk (`<branch>`). Check out a feature branch first.
```

### 2. List canonical plan entries

Run:

```text
brmem list --namespace brmem-plans --branch <current-branch> --format json
```

Parse the returned entries. If there are no entries, abort with:

```text
No brmem-plans entries on branch `<current-branch>`.

Create a saved plan with `/write-plan`, attach it to a planned branch with
`/create-planned-branch`, or provide a branch/key that already has a canonical plan.
```

### 3. Select the plan key

Use this selection order:

1. If the user supplied a key or slug, normalize it to a candidate key:
   - exact keys ending in `.md` are used as-is
   - slugs without `.md` become `<slug>.md`
   - reject empty keys, keys with `..`, keys with leading `/`, and keys that are
     not present in the `brmem-plans` listing
2. Otherwise, take the current branch's final path segment and try
   `<segment>.md` if that key exists.
3. Otherwise, if exactly one `brmem-plans` entry exists, use that key.
4. Otherwise, stop and ask which plan key to implement. Show the available keys.

Do not fall back to base entries or legacy paths.

### 4. Load the selected plan

Read the selected entry:

```text
brmem get <key> --namespace brmem-plans --branch <current-branch>
```

Load the full content into session context without truncating or rewriting it.

### 5. Report what was loaded

Print a short block before editing:

```text
Branch: <current-branch>
Namespace: brmem-plans
Selected key: <key>
Bytes/ref: <byte-count and ref if available from the listing>
Plan summary:
  - <3–5 bullets summarizing the primary plan content>
```

If the listing did not include bytes or ref metadata, say they were unavailable
rather than inventing them.

### 6. Create an implementation checklist

Create a session TODO/checklist from the plan using the mechanism available in
the current agent runtime. If there is no dedicated TODO tool, present the
ordered checklist to the user before editing.

- Preserve the plan's order when it has explicit steps.
- Break prose-only plans into the smallest obvious ordered tasks.
- Mark or announce the first task as in progress only when implementation starts.

### 7. Begin implementation

Start executing the plan after the checklist exists. Apply normal project rules:

- read before editing
- use precise edits for existing files
- run relevant validation
- do not commit, push, submit, or publish unless the user explicitly asks

If the plan is ambiguous or internally inconsistent, stop and quote the specific
ambiguity instead of guessing.

## Manual verification scenarios

1. **Slug branch with canonical key** — on branch `<slug>`, with key
   `<slug>.md` in namespace `brmem-plans`, the skill selects the key,
   summarizes it, creates a checklist, and begins implementation.
2. **No canonical entries** — a branch with no `brmem-plans` entries aborts with
   guidance to create or supply a canonical plan.
3. **Multiple canonical entries** — a branch with multiple `brmem-plans` entries
   and no branch-segment match asks the user to choose a key.
4. **Trunk branch refusal** — `main`, `master`, or the configured default branch
   is refused before implementation starts.
5. **Detached HEAD refusal** — detached HEAD aborts before any Branch Memory read.
