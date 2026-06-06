---
name: roast
description: Use this skill when the user asks to roast or review the current branch/diff with roaster review definitions, names a roaster review such as simplify, dignified-python, or typescript-style, or asks which roaster reviews to run. Trigger for phrases like "roast simplify", "run the simplify roast", "roast this branch", "use roast on this branch", or "run a roaster review". This skill prompts for review selection when unspecified and performs the review in the current agent context; it must not invoke the external roaster review harness.
allowed-tools:
  - "Bash(uv run roaster review list*)"
  - "Bash(uv run roaster review list-matching*)"
  - "Bash(git rev-parse*)"
  - "Bash(git branch*)"
  - "Bash(git diff*)"
  - "Bash(gt branch info*)"
  - "Bash(find reviews*)"
  - "Read"
  - "Grep"
---

<!-- PUBLIC SKILL: Do not reference asdl-internal module paths or class names in this file. Describe CLI operations, not implementation. -->

# roast

Run roaster-style reviews in the current agent context. Reuse review
definitions from `reviews/*.md`, but make the current agent the review harness:
read the review instructions, inspect the current branch diff, and report
findings directly.

## When to use

Use this skill when the user asks to roast a branch, roast a diff, run a named
roaster review, run all matching roasts, or choose from available roaster review
definitions.

Common examples:

- `roast simplify`
- `run the simplify roast`
- `roast this branch`
- `run all matching roasts against master`
- `which roaster reviews can I run?`

## Safety boundary

This skill is read-only by default.

- Do not edit files, stage changes, commit, push, or mutate GitHub.
- Do not run tests unless the user separately asks for fixes or validation after
  the roast report.
- Do not launch subagents unless the user explicitly asks for a separate review
  process.
- Do not call `roaster review run`; that command dispatches to the configured
  external review harness. In this skill, the current agent performs the review.
- Do not use `default_model` from review frontmatter to change models. Treat it
  as informational only; the surrounding harness/model is authoritative.
- If the user asks to fix findings, finish or frame the roast report first, then
  ask for confirmation and scope before editing.

## Review selection

1. Parse the user request for explicit review keys. Support one key or multiple
   keys when the user names them.
2. Discover available reviews before asking or running:
   - Prefer `uv run roaster review list --format json`.
   - If that fails because the roaster CLI is unavailable, fall back to:
     `find reviews -maxdepth 1 -type f -name '*.md' -print | sort`.
3. If explicit keys were provided, validate that every key exists. If any key is
   unknown, show the available keys and ask for correction.
4. If no review was specified, do not run a review until the user chooses. Ask
   exactly one concise selection question using the current harness's structured
   question tool when available, otherwise normal prose. Include:
   - one option per discovered review key, with concise descriptions when easy;
   - `all matching changed files`; and
   - `all reviews`.
5. If the user chooses `all matching changed files`, use
   `uv run roaster review list-matching --base-ref <base-ref> --format json`.
   If matching cannot be computed, explain the failure and offer to run all
   reviews or a specific review.
6. If the user chooses `all reviews`, run every discovered review.

Do not overfit to the review keys that exist today. Any `reviews/<key>.md` file
can become a valid review definition.

## Base ref

1. If the user supplies a base ref, use it.
2. Otherwise, prefer the Graphite parent from `gt branch info` when available;
   stacked branches should review only the current frame, not the whole stack.
3. If Graphite is unavailable or does not identify a parent, choose the first
   ref that verifies:
   - `git rev-parse --verify origin/master`
   - `git rev-parse --verify master`
   - `git rev-parse --verify origin/main`
   - `git rev-parse --verify main`
4. If no base can be resolved, ask the user for a base ref before reviewing.

Report the selected base ref and how it was chosen in the final output.

## Preflight

Before loading the diff:

1. Resolve the repository root with `git rev-parse --show-toplevel`.
2. Resolve the branch with `git branch --show-current`. If detached, report it
   as `detached HEAD`.
3. Verify that `reviews/` exists or that review discovery succeeded.
4. Resolve the base ref as described above.
5. Get changed paths with `git diff --name-only <base-ref>...HEAD`.

Stop with a clear prerequisite message if not in a git checkout, no review
files exist, or there are no changed paths against the selected base ref.

## Diff loading

Load the scoped diff with:

```bash
git diff --no-ext-diff --find-renames <base-ref>...HEAD -- <paths...>
```

Ground findings in changed lines or small changed ranges. Reading nearby files
is allowed only to confirm a finding, such as whether an existing helper already
covers newly-added logic.

If the full diff is too large for the current harness or output limits:

- use changed-path lists and targeted per-file diffs;
- prioritize files matched by the selected review's `when_changed` globs when
  those globs are available;
- state in the report that the review was scoped to targeted diffs because the
  full diff was too large.

## Running a selected review

For each selected review key:

1. Read `reviews/<key>.md`.
2. Treat YAML frontmatter as metadata:
   - `description` summarizes the review;
   - `default_model` is informational only;
   - `when_changed` can help decide applicability or focus, but explicit user
     selection overrides it.
3. Treat the Markdown body after frontmatter as the review instructions.
4. Apply those instructions to the gathered diff using only read-only
   inspection.
5. If frontmatter is malformed, continue with the readable body as the review
   instructions and note that metadata could not be parsed.

When a review definition asks for an empty findings list on no findings, render
`No findings` in Markdown unless the user explicitly requested JSON.

## Output format

Default to a concise, stable Markdown report:

```markdown
# roast review

- Base ref: `<base-ref>`
- Branch: `<branch-or-detached-head>`
- Reviews: `<comma-separated-review-keys>`

## `<review-key>` — <short description if available>

### Findings

- [<severity>] `<path>:<line-or-range>` — <summary>
  <details, including the specific rule/angle and why it matters>

### No findings

No concrete findings for `<review-key>`.

## Notes

- <Scope limitations, unavailable commands, oversized diff caveats, or skipped reviews.>
```

Rules for the report:

- Omit `### Findings` when there are no findings; use `### No findings`
  instead.
- Use severity labels only from `info`, `warning`, or `error`.
- Keep findings high-signal and grounded in the diff.
- Include concrete file and line references when possible.
- Keep separate sections per review when multiple reviews run.
- For `simplify`, include the cleanup angle in the details: `reuse`,
  `simplification`, `efficiency`, or `altitude`.

If the user requests JSON, keep the same information but return structured data
with the selected base ref, branch, reviews, findings, and notes.

## Edge cases

- Not in a git repo: stop and report that roast needs a git checkout or pasted
  diff.
- No `reviews/` directory: ask whether the user wants a generic code review
  instead.
- Unknown review key: show available keys and ask for correction.
- No changed paths: report no diff against the selected base ref.
- Roaster CLI unavailable: fall back to direct `reviews/*.md` discovery;
  matching selection may be unavailable, so offer all reviews or explicit review
  choices.
- Malformed review frontmatter: use the readable body as instructions and note
  that metadata such as description or `when_changed` could not be parsed.
- Explicit review does not match changed files: run it anyway; explicit means
  explicit.
- User asks to fix findings: do not silently switch from review to
  implementation. Finish the roast report or ask for confirmation and scope
  before editing.
