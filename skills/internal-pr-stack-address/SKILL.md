---
name: internal-pr-stack-address
description: "Create a stack-tip omnibus PR that addresses unresolved feedback across every PR in the current Graphite stack, then resolve the original review threads. Use when the user asks to address all feedback in a stack, create an omnibus follow-up PR, retroactively resolve stack comments, or run pr-address across a stack. Internal asdl workflow."
allowed-tools:
  - "Bash(gt *)"
  - "Bash(git *)"
  - "Bash(gh *)"
  - "Bash(uv run *)"
  - "Bash(just *)"
  - "Read"
  - "Edit"
  - "Write"
  - "Grep"
  - "Glob"
metadata:
  internal: true
---

# internal-pr-stack-address

Address unresolved feedback across every PR in the current Graphite stack by
creating a new child branch at the stack tip, committing the fixes there, and
resolving the original lower-stack review threads with explicit omnibus wording.

This is intentionally **not** normal `pr-address`: `pr-address` is scoped to the
current branch's PR. This skill is stack-scoped and creates a follow-up omnibus
PR branch at the tip.

## When to use

Use when the user explicitly wants a stack-wide feedback pass, for example:

- "address all feedback in this stack"
- "make an omnibus PR for stack feedback"
- "retroactively resolve comments across the stack"
- "run pr-address across every PR in the stack"

Do not trigger from ordinary single-PR review feedback requests; use
`pr-address` for those.

## Guarantees

- Operates on the full current Graphite stack by default.
- Requires strict open-PR coverage for stack branches; stop on missing PRs
  unless the user explicitly overrides.
- Creates or reuses a child branch at the stack tip named
  `<stack-prefix>/address-stack-feedback` by default.
- Does **not** run `gt submit`, `git push`, or `gh pr create` by default.
- Shows a compact execution plan before editing.
- Auto-executes only mechanical/simple feedback; asks before complex or
  human-sensitive work.
- Runs targeted checks plus formatter checks before committing and before
  resolving GitHub comments.
- Requires explicit final confirmation before resolving GitHub threads, because
  the omnibus branch may still be local-only.
- Uses `pr-address exec` helpers for GitHub mutations; never hand-roll review
  thread mutation API calls.

## Required supporting skills

Load these when their domain is touched:

- `graphite` — stack topology, branch creation, and navigation.
- `pr-address` — feedback helper commands and GitHub mutation helpers. Read
  `references/cli-reference.md` before calling any `pr-address exec` helper.
- `internal-code-gh` — any `gh` use beyond simple PR listing/viewing.
- Language/test skills as needed for code changes, e.g. `typescript-style`,
  `dignified-python`, `pytest`, or fake-driven testing skills.

## Workflow

### 1. Preflight

1. Verify prerequisites:
   - `gh auth status` succeeds.
   - `gt ls --stack` succeeds.
   - The `pr-address` runner exists and is executable. Resolve it from the
     installed `pr-address` skill directory, e.g.
     `.agents/skills/pr-address/scripts/pr-address-run`.
2. Inspect `git status --short --branch`.
3. Require a clean worktree before stack navigation or branch creation. If the
   tree is dirty, stop unless the user explicitly asks to carry the existing
   changes into the omnibus branch.
4. Determine the full current Graphite stack from trunk through tip. If the user
   starts in the middle, identify the stack tip and move there only after the
   worktree safety check.
5. Resolve every non-trunk stack branch to an open PR with `gh pr list` or
   equivalent. Stop if any branch lacks an open PR unless the user explicitly
   chooses to continue.

### 2. Fetch stack feedback

For each stack PR, run the compact helper first:

```bash
<pr-address-runner> exec summarize-feedback <pr_number> --format json
```

Default to unresolved threads only. Include resolved threads only if the user
explicitly asks for reference/audit mode.

Use full branch checkout plus `pr-address exec prepare-run --format json` only
when compact feedback is insufficient, such as ambiguous outdated threads,
contested-thread handling, or moved/restructured-file evidence.

### 3. Classify and plan

Classify all feedback surfaces:

- inline review threads
- PR-level review submissions
- top-level PR discussion comments

Completeness invariant: every unresolved inline review thread from every stack
PR appears exactly once in the plan. Never hide unresolved threads in an
informational count.

Drop obvious automation/status discussion comments with no request. Treat human
top-level review/discussion comments conservatively: include them in the plan,
but require explicit approval before replying to them.

Use these complexity classes:

- `pre_existing` — moved/restructured bot comments or already-present behavior
- `local` — one file, one small location
- `single_file` — one file, multiple locations
- `cross_cutting` — multiple files
- `complex` — architectural or coordinated changes
- `informational` — question/approval/no-op thread that may need a reply only

Auto-proceed classes:

- bot/style/nit feedback after local verification
- `pre_existing`, `local`, and `single_file` fixes
- factual false-positive explanations after inspecting the code

Ask before:

- human-requested cross-cutting or complex changes
- architectural changes
- ambiguous or subjective requests
- top-level PR review/discussion replies
- informational thread actions

Show a compact grouped plan before editing. Include PR number, thread/comment
ID, path/line when available, complexity, and one-line action summary.

### 4. Create or reuse the omnibus branch

Default branch name: `<stack-prefix>/address-stack-feedback`, where
`<stack-prefix>` is the prefix before `/` from the stack's top branch when
present. Add a numeric suffix only when needed.

Rerun/idempotency policy:

- If the omnibus branch already exists, reuse it when it is the child of the
  current stack tip or clearly belongs to this stack.
- Re-fetch feedback and act only on still-unresolved items.
- Ignore already-resolved threads with existing `pr-address` resolution markers.
- Do not create duplicate branches or duplicate resolution replies.

When creating a new branch, use Graphite from the stack tip:

```bash
gt create <branch-name> -m "Address PR stack feedback"
```

Do not submit or push by default.

### 5. Execute approved batches

For each approved batch:

1. Inspect the referenced code, not just the comment excerpt.
2. Verify bot comments against local context before editing.
3. Make the smallest coherent fix.
4. For false positives or already-fixed items, do not change code; prepare a
   factual `explained` resolution message.
5. Run targeted tests/typechecks for touched packages plus formatter checks.
   Escalate to full `just` when changes cross package/language boundaries or
   no targeted check is obvious.
6. If formatter/linter failures occur, use repo-approved autofixes (`just fix`,
   `just dprint-fix`) rather than hand-formatting. Rerun checks.
7. Commit one coherent batch, preferring a single omnibus commit for related
   mechanical feedback. Split only when changes are semantically unrelated.

Commit message format:

```text
Address PR stack feedback (batch N/M)

- <summary 1>
- <summary 2>
```

### 6. Resolve original inline threads

Before any GitHub mutation:

1. Re-fetch feedback for all stack PRs.
2. Confirm the unresolved-thread set still matches the planned addressed items.
3. Show the batch commit SHA and exact resolution count.
4. Ask the user for explicit confirmation because the omnibus branch may not
   have been submitted yet.
5. Remind the user to submit the omnibus PR promptly after resolution.

Use `resolve-thread-batch` for inline threads. Read its entry in
`pr-address/references/cli-reference.md` immediately before calling it.

Resolution message rules:

- Use canonical `pr-address` helper formatting.
- Include explicit omnibus wording, e.g. "Fixed in the stack-tip omnibus commit
  by converting object-shape aliases to interfaces."
- Use `mode=fixed` for code changes.
- Use `mode=explained` for false positives or already-fixed cases.
- Use `mode=pre_existing` for moved/restructured pre-existing comments.

Use `continue_on_error: true`. If any item fails, do not roll back successful
resolutions. Record failed thread IDs and provide retry/fallback instructions.

### 7. Verify and hand off

After resolution, re-fetch every stack PR with `summarize-feedback` and report:

- PRs scanned
- unresolved threads before/after
- actionable items addressed
- commits created
- threads resolved
- resolution failures, if any
- top-level human comments skipped or awaiting approval
- checks run and their result
- branch name and commit SHA

Finish with manual next steps:

1. Review the local omnibus commit(s).
2. Run `gt submit --no-interactive` when ready.
3. Wait for CI.
4. Re-request review if needed.

Never push or submit unless the user explicitly asks for that extra step.

## CLI push-down candidates

Keep semantic classification and code changes in the model. If this workflow
repeats often, consider adding deterministic helpers for:

- stack branch → open PR mapping
- stack-wide compact feedback collection
- unresolved-thread completeness checks
- resolution payload assembly from a reviewed plan
- rerun/idempotency summaries
