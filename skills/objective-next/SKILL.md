---
name: objective-next
description: "Command: objective-next"
allowed-tools:
  - "Bash(objective exec next-context *)"
  - "Bash(objective exec next-collision *)"
  - "Read"
  - "Write"           # session-plan stub for ExitPlanMode
  - "ExitPlanMode"    # bounce out of plan mode before reporting
---

# objective-next

Read-only status peek and next-slice recommendation for an objective.

> For shared concepts — vocabulary, storage model, content anatomy, lifecycle,
> carry-forward semantics, and mutation contracts — see
> `../objective/SKILL.md`.

## Goal

Given an optional objective slug, load the current branch's objective-next
context through the tested CLI contract, summarize the returned Markdown, and
suggest a collision-checked kebab-case slug for the next PR-sized slice.

`next` owns semantic judgment only: status summary, open-work interpretation,
next-slice choice, candidate slug wording, and final response formatting.
Deterministic facts come from:

- `objective exec next-context [<slug>] --format json`
- `objective exec next-collision <candidate-slug> --format json`

## Inputs

- **Slug, optional.** Parse the objective slug from the prompt when present and
  pass it to `next-context`. If omitted, call `next-context` with no slug.
- `next` plans against the current branch only. There is no `--from`,
  `--from-file`, `--branch`, `--source`, or other source-selection flag. To
  inspect a different branch, check it out first.

## Core Rules

- **Read-only.** Do not mutate brmem, git refs, branches, files, checkboxes, or
  the working tree.
- **CLI authority.** Do not run raw `git`, `brmem`, Graphite, source-code
  inspection, or `objective exec update-precheck`. Treat `next-context` as the
  authority for current branch, trunk branch, slug resolution, file presence,
  raw content, and freshness advisory.
- **Current-branch-only source.** Always use the snapshot resolved by
  `next-context`; do not walk ancestors or load canonical state by hand.
- **Content-only.** Do not inspect repo source files to audit progress.
  Implementation evidence is folded back later by `objective-update`.
- **Collision-safe suggestion.** Check the suggested slice slug with
  `next-collision`. On collision, warn and ask for a human choice; do not
  auto-resolve.
- **No implementation work.** Do not create branches, claim objectives, write
  plan files, edit checkboxes, or change source during `objective-next`.

## Workflow

### 1. Plan-mode bypass (if active)

If the current harness exposes plan mode and a writable session-plan path:

1. Use `Write` to put a one-line session-plan at the harness-provided
   session-plan path, e.g.:

   ```md
   # /objective-next — read-only status peek

   Run objective-next to inspect the current branch's objective snapshot and
   suggest the next-slice slug. No mutations.
   ```

2. Call `ExitPlanMode`.
3. If the user approves, continue with Step 2. If the user declines, abort and
   ask them to re-run `/objective-next` outside plan mode.

If plan mode is not active, start at Step 2.

### 2. Load current-branch objective context

Call exactly one context command:

```bash
objective exec next-context [<slug>] --format json
```

- Include `[<slug>]` only when the prompt supplied one.
- If the command fails, surface the CLI error directly and stop. Do not
  reproduce branch, trunk, slug, file-discovery, or freshness edge-case logic
  in prose.
- From the JSON payload, use the resolved branch/source fields, content-file
  presence, `body_content`, `roadmap_content`, `notes_content`, and any
  freshness advisory fields returned by the CLI.

### 3. Report status from returned Markdown

Read only the Markdown content returned by `next-context`.

Keep the status report tight enough to verify at a glance:

- source label / current branch and resolved slug
- content files present
- title and status from `body_content`
- progress state from `body_content`, `roadmap_content`, and `notes_content`
- first meaningful open work, especially unchecked roadmap items
- durable findings or notes presence, summarized in one line when useful
- freshness advisory from `next-context`, if present
- description/goals summary only when it adds signal

If optional content is absent, say so briefly and fall back to the available
Markdown. Do not fetch missing files yourself.

### 4. Choose a candidate next-slice slug

Use semantic judgment over the returned Markdown:

- Prefer the first unchecked roadmap item that is still PR-sized.
- If priority is non-obvious, present 2-3 candidate slugs with one-line
  rationales and ask the user to choose.
- Generate the candidate slug yourself; the CLI does not supply it.

Slug rules:

- lowercase ASCII, hyphen-separated
- specific to the slice, not the whole objective
- no `.md` suffix
- usually 50 characters or fewer
- no redundant `objective-` prefix and no verbatim repeat of the parent slug

### 5. Check candidate slug collision

After choosing one candidate slug, call:

```bash
objective exec next-collision <candidate-slug> --format json
```

Report the returned collision state:

- `clear`: safe to use
- `branch_exists`: a local branch already uses the slug
- `canonical_exists`: a canonical objective already uses the slug
- warnings: include them verbatim or summarized without changing their meaning

On any collision or warning, ask for a human choice: pick another slug, append a
suffix, or proceed knowingly. Do not auto-resolve.

### 6. Final output

Return:

- source label / current branch and resolved objective slug
- concise status summary and open-work summary
- suggested next-slice slug and collision result
- freshness reminder, if `next-context` returned one
- next-step hint:

```text
To proceed: write or choose a plan file for <suggested-slug>, run
brmem-branch-create, navigate to the created branch, then run
objective-claim <objective-slug>. After implementing and merging the slice,
run objective-reconcile <objective-slug> on the trunk branch.
```

## Edge Cases And Anti-Patterns

- Surface `next-context` failures directly for detached `HEAD`, missing slug,
  multiple current-branch objectives, trunk with zero/one/multiple canonicals,
  missing files, and freshness diagnostics.
- Never derive an objective slug from the branch name; use the slug resolved by
  `next-context`.
- Never run raw `git`, raw `brmem`, Graphite, `objective exec update-precheck`,
  source-code inspection, branch creation, brmem writes, checkbox edits, or
  source edits during `objective-next`.
- Never auto-pick from ambiguous CLI output and never auto-resolve collisions.
