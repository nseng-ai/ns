---
name: brmem-create-plan-branch-from-file
description: Create and review a temp Markdown implementation plan outside the repo, then use create_brmem_plan_branch_from_file to create an implementation branch and store the plan in Branch Memory namespace brmem-plans with key <slug>.md.
allowed-tools:
  - "Bash(brmem exec resolve-prompt *)"
  - "Read"
  - "Write"
  - "create_brmem_plan_branch_from_file"
---

# brmem-create-plan-branch-from-file

Create an implementation branch and attach its reviewed plan with the canonical
Branch Memory plan-branch tool.

Use this skill when the user wants to turn a request, design, or work item into
a durable branch plan without checking a plan file into the repository.

## Contract

**The skill owns:** inspecting the requested work, writing a complete Markdown
implementation plan to a temporary file, reading that temp file back for review,
choosing a semantic kebab-case slug, optionally choosing a target `branchName`
and `branchCreation` backend from repo policy, invoking
`create_brmem_plan_branch_from_file`, and reporting the tool evidence.

**The repo policy prompt owns only policy guidance:** branch naming conventions,
branch creation backend selection, slug restrictions, or extra pre-invocation
review checks. A prompt must not create branches, run `git`, run `gt`, run
`brmem put`, publish work, or otherwise perform the mutations owned by the tool.

**The tool owns the mutations:** creating the implementation branch using the
requested safe backend (default `plain-git`, or `graphite` when policy
explicitly requests it) and storing the reviewed plan in Branch Memory namespace
`brmem-plans` with key `<slug>.md` on that branch.

## Rules

- **Use the canonical tool.** Do not manually run `git branch`, `git switch`,
  `gt track`, `brmem check`, or `brmem put` for this workflow.
- **Use a temp Markdown file outside the repository.** Do not create a checked-in
  plan file. Prefer a path under the system temp directory.
- **Review before persisting.** After writing the temp file, read it back and
  confirm the final content is the plan you intend to store before choosing the
  slug and invoking the tool.
- **Choose the slug from the final plan content.** Use semantic kebab-case, keep
  it concise, and describe the change rather than the document. Do not include
  a `.md` suffix in the `slug` argument.
- **Pass only policy-selected branch backends.** Omit `branchCreation` for the
  default plain Git backend, or pass `branchCreation: "graphite"` only when the
  resolved policy explicitly says to.
- **Store only the canonical plan entry.** The storage contract is namespace
  `brmem-plans`, key `<slug>.md`, attached to the target implementation branch.
- **Resolve only the new policy prompt when policy is needed.** Use
  `brmem exec resolve-prompt create-brmem-plan-branch --format json`; never
  resolve or fall back to the legacy prompt name.
- **Do not publish.** Never push, submit, or open a PR as part of this skill.

## Workflow

### 1. Inspect the request

Understand the requested implementation well enough to write an executable plan.
Read only the relevant repository files needed to make the plan concrete.

If repo-specific policy is needed, resolve it with:

```text
brmem exec resolve-prompt create-brmem-plan-branch --format json
```

When resolution succeeds, read the returned `data.path` and follow it as policy
guidance only. If the policy says to use Graphite, pass
`branchCreation: "graphite"` to the tool; do not run Graphite commands yourself.
If resolution fails and policy is required to proceed, stop and surface the
error. Do not try the old prompt name.

### 2. Write the implementation plan

Create a detailed Markdown plan that includes:

- goal and non-goals
- files or areas expected to change
- implementation steps in order
- validation commands or manual checks
- risks, edge cases, or open questions

Write the completed plan to an absolute temp file outside the repository, for
example `/tmp/<slug-or-topic>-plan.md`. The temp file is the source of truth for
what the tool will store.

### 3. Read and review the temp file

Read the temp file back in full. Check that it is complete, self-contained, and
free of accidental scratch notes. If it needs changes, edit or rewrite the temp
file and review it again before continuing.

### 4. Choose slug, optional branch name, and optional branch backend

Derive a semantic kebab-case slug from the reviewed plan content. Examples:

- `rename-plan-branch-skills`
- `add-cache-invalidation-hook`
- `split-reviewer-exec-group`

Use the slug as the default branch name unless repo policy or an explicit user
instruction requires an override. When policy requires a prefixed branch, pass an
explicit `branchName`, for example `brmem-plans/<slug>`. The Branch Memory key
remains `<slug>.md` regardless of the branch name.

Omit `branchCreation` unless repo policy specifies a branch creation backend.
When policy says Graphite, pass `branchCreation: "graphite"`; when policy says
plain Git, pass `branchCreation: "plain-git"` or omit it.

### 5. Invoke the tool

Call `create_brmem_plan_branch_from_file` with:

- `slug`: the slug without `.md`
- `filePath`: the absolute temp Markdown path outside the repository
- `branchName`: optional explicit target implementation branch
- `branchCreation`: optional branch creation backend requested by policy,
  either `plain-git` or `graphite`
- `summary`: optional one-sentence summary of the plan

Exact optional-backend tool call shape:

```json
{
  "slug": "semantic-kebab-case-slug",
  "filePath": "/absolute/path/to/temp-plan.md",
  "branchName": "optional/target-branch-name",
  "branchCreation": "graphite",
  "summary": "One-sentence summary of the plan."
}
```

Omit `branchName` and `branchCreation` when they are not needed.

The tool preflights the source file, target branch, requested backend, and Branch
Memory entry. If it refuses the request, report the refusal and do not perform
manual fallback mutations.

### 6. Report evidence

Report the evidence returned by the tool, including:

- created branch
- branch creation method
- start point
- namespace (`brmem-plans`)
- key (`<slug>.md`)
- ref
- commit
- source temp file
- summary

Close with the next step for the user, such as checking out the new branch or
starting implementation with `brmem-plan-impl`.

## Manual verification scenarios

1. **Happy path with default branch name** — write a temp plan outside the repo,
   review it, invoke the tool with `slug` and `filePath`, and verify the reported
   namespace is `brmem-plans` with key `<slug>.md`.
2. **Explicit branch name** — use repo policy such as `branchName:
   brmem-plans/<slug>` and verify the Branch Memory key remains `<slug>.md`.
3. **Markdown-driven Graphite backend** — use repo policy that instructs
   `branchCreation: "graphite"` and verify the tool reports `Branch creation:
   graphite` without changing the current checkout or running manual `gt track`
   or `brmem put` commands.
4. **Invalid source file rejected** — pass a missing, relative, non-Markdown, or
   in-repo path and verify the tool refuses before creating a branch or entry.
5. **Existing target refused** — try an existing branch or existing `<slug>.md`
   entry in namespace `brmem-plans` and verify the tool refuses without
   clobbering.
6. **No old prompt fallback** — remove or ignore old prompt assets and verify the
   skill only resolves `create-brmem-plan-branch`.
