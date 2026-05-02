---
name: objective-next
description: "Command: objective-next"
allowed-tools:
  - "Bash(objective exec next-context *)"
  - "Bash(objective exec next-collision *)"
  - "Read"
  - "Write"
  - "ExitPlanMode"
---

# objective-next

Read-only objective snapshot summary plus next-slice slug recommendation.

If objective vocabulary or file anatomy is unclear, read `../objective/SKILL.md`.

## Scope

- Optional input: objective slug. If absent, let `next-context` resolve it from
  current-branch claims.
- Source: current branch only. Do not inspect another branch, ancestor,
  canonical fallback, or branch name.
- Output: concise status summary, one suggested PR-sized slice slug, collision
  result, and next-step hint.

## Hard Rules

- Read-only: no brmem writes, git ref changes, branch creation, checkbox edits,
  source edits, or working-tree mutation.
- Deterministic facts come only from:
  - `objective exec next-context [<slug>] --format json`
  - `objective exec next-collision <candidate-slug> --format json`
- Do not run raw git, brmem, Graphite, or source-code inspection for branch
  resolution, slug discovery, content loading, freshness, progress auditing, or
  collision checks.
- Semantic work stays in the skill: read returned Markdown, summarize prose,
  choose the next slice, and name the candidate slug. Do not expect helper
  fields for title, progress parsing, or suggested slug.

## Workflow

### 0. Leave plan mode if needed

If the harness is in plan mode and provides a writable session-plan path:

1. `Write` a one-line plan such as:

   ```text
   # /objective-next — read-only status peek
   Inspect the current branch objective snapshot and suggest the next slice. No mutations.
   ```

2. Call `ExitPlanMode`.
3. If approved, continue. If declined, stop and ask the user to rerun outside
   plan mode.

Skip this section when plan mode is not active.

### 1. Fetch context

Run exactly one context command:

```bash
objective exec next-context [<slug>] --format json
```

On success, use its JSON for branch, trunk, resolved slug, present files, raw
`body.md` / `roadmap.md` / `notes.md` content, and freshness advisory.

On failure, surface `message` and stop. If the error is ambiguity, list the
candidate slugs from the response and ask the user which one to inspect. Do not
probe independently.

### 2. Read the Markdown semantically

From the returned raw content, extract only what is useful:

- title and status from `body.md`
- short goal/description summary, if it adds signal
- progress counts and open work from `roadmap.md`, if present
- durable findings / notes presence from `notes.md`, if present
- first unchecked roadmap item that looks like a PR-sized next slice

Do not inspect repository source files to verify progress; `objective-update`
folds implementation evidence back later.

### 3. Choose and check a candidate slug

Prefer the first unchecked slice-like roadmap item. If priority is unclear,
show 2-3 candidate slugs with one-line rationales and ask.

Slug rules:

- lowercase ASCII kebab-case
- specific to the slice, not the parent objective
- no `.md` suffix
- usually <= 50 characters
- no redundant `objective-` prefix
- not a verbatim repeat of the parent slug

After choosing one candidate, run:

```bash
objective exec next-collision <candidate-slug> --format json
```

Report `clear`, `branch_exists`, and `canonical_exists`. If `clear` is false,
warn and ask the user to choose another slug or explicitly proceed; do not
invent a suffix silently.

### 4. Final response

Include:

- source: `current branch <branch>` and parent objective slug
- content files present
- title/status and compact progress summary
- notes/finding presence, if present
- freshness advisory, if returned by `next-context`
- suggested next-slice slug and collision result
- next-step hint:

```text
To proceed: write a plan file using <suggested-slug>, run
brmem-branch-create, navigate to the new branch, then run
objective-claim <parent-slug>. After implementing the slice, merge the PR and
run objective-reconcile <parent-slug> on the trunk branch.
```

If the snapshot is stale, prepend a reminder to run `objective-update <slug>` on
the current branch before creating another branch that will claim from it.

## Edge Cases

- Missing claims, trunk-empty states, absent files, detached HEAD, and ambiguous
  claims are owned by `next-context`; surface its message.
- Branch name may name the slice, while the claimed objective slug names the
  parent. Never infer one from the other.
- Multiple claimed objectives can be legitimate. Never auto-pick; ask.
- Optional files may be absent. Report what exists and fall back to available
  prose.
