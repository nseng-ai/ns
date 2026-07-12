---
name: code-just-fix
disable-model-invocation: true
description: "Command: code-just-fix"
allowed-tools:
  - "Bash(just *)"
  - "Bash(uv run *)"
  - "Read"
  - "Edit"
  - "Glob"
  - "Grep"
  - "Write"
metadata:
  internal: true
---

# code-just-fix

Run `just` (the project's default check suite) and fix every failure.

## Invocation

1. **Run `just`** in the project root and capture full output.
2. **Categorize failures by failing `just` recipe** — from the ``error: Recipe `<name>` failed`` lines and each recipe's output — into: formatting, lint, type/compile errors, test failures, and project-metadata checks.
3. **Fix the underlying code**, not the checks:
   - Formatting/lint: run `just fix` (plus any recipe-specific fixer the justfile provides), then re-run `just` to confirm.
   - Type/compile errors: fix the source code until the failing check recipe passes.
   - Test failures: **read the failing test AND the code under test**. Fix the production code or the test depending on where the real bug is. Never delete, skip, or weaken a test to make it pass — fix the root cause. Never suppress failures with lint/type-ignore comments, test skips, or similar mechanisms.
4. **Re-run `just`** after all fixes. Repeat until green, you hit an iteration limit (see below), or you need user input.
5. If a failure is ambiguous (e.g., a test asserts behavior you're unsure is correct), **ask the user directly** before changing anything.

## Planning-mode behavior

If the current harness has a planning or read-only mode and it is active:

1. Run `just` to collect failures.
2. For each failure, read the relevant source and test files.
3. **Do not edit any files.** Instead, present a structured plan:
   - List each failure with file, line, and root cause.
   - For each, state the proposed fix (which file to change, what to change, and why).
4. Stop after presenting the plan so the user can approve before you apply changes. If the harness requires an explicit transition out of planning mode, use its normal mechanism.

## Iteration Limits

- **Maximum iterations**: 10. If `just` has not gone green after 10 fix-then-rerun cycles, stop and report (see Stuck format below).
- **Stuck detection**: If the *same* error appears in 3 consecutive iterations, stop immediately — you are not making progress on it. Report and ask the user for guidance.

## Progress Tracking

Print a numbered log line to the user after each iteration so they can follow along:

```
Iteration 1: Running `just` — 2 recipes failing (dprint-check, ts-check)
Iteration 2: Ran `just fix` — format/lint clean, 1 type error remains (ts-check)
Iteration 3: Fixed type error in the failing module — all checks pass
```

## Reporting Formats

### Success

```
## code-just-fix: SUCCESS

All checks passed after N iteration(s), one line per recipe the justfile ran:

- **<recipe>**: PASSED
- **<recipe>**: PASSED
```

### Stuck

```
## code-just-fix: STUCK

Unable to resolve the following after N attempts:

**Check**: [failing just recipe]
**Error**: [exact error message]
**File**: [path if applicable]

**Attempted fixes**:
1. [first attempt]
2. [second attempt]
3. [third attempt]

**Suggested next steps**: [what the user should look at]
```
