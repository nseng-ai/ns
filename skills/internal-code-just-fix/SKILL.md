---
name: internal-code-just-fix
description: "Command: internal-code-just-fix"
# Original description (preserved for reference):
# Run `just` and fix all failures (lint, format, type errors, test failures) by fixing the underlying code — not by deleting or weakening tests. If user input is needed, ask the user. If the current harness is in a planning or read-only mode, present a plan to fix the failures instead of applying changes.
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

<!-- PUBLIC SKILL: Do not reference asdl-internal module paths or class names in this file. Describe CLI operations, not implementation. See AGENTS.md § "Public Skill Authoring". -->

# internal-code-just-fix

Run `just` (the project's default check suite) and fix every failure.

## Invocation

1. **Run `just`** in the project root and capture full output.
2. **Categorize failures** into: lint (`ruff check`), format (`ruff format --check`, `dprint check`), type errors (`ty check`), and test failures (`pytest`).
3. **Fix the underlying code**, not the checks:
   - Lint/format: run `just fix` and `just dprint-fix`, then re-run `just` to confirm.
   - Type errors: fix the source code so `ty check` passes.
   - Test failures: **read the failing test AND the code under test**. Fix the production code or the test depending on where the real bug is. Never delete, skip, or weaken a test to make it pass — fix the root cause.
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

## Rules

- Always fix the root cause. If a test is failing because production code changed, fix the production code (or update the test if the new behavior is intentionally correct — but ask first if unsure).
- Never use `# noqa`, `# type: ignore`, `@pytest.mark.skip`, or similar suppressions to silence failures.
- After all fixes, run `just` one final time and confirm the full suite is green.

## Iteration Limits

- **Maximum iterations**: 10. If `just` has not gone green after 10 fix-then-rerun cycles, stop and report (see Stuck format below).
- **Stuck detection**: If the _same_ error appears in 3 consecutive iterations, stop immediately — you are not making progress on it. Report and ask the user for guidance.

## Progress Tracking

Print a numbered log line to the user after each iteration so they can follow along:

```
Iteration 1: Running `just` — found 3 lint errors, 2 format issues
Iteration 2: Ran `just fix` + `just dprint-fix` — lint/format clean, 1 ty error remains
Iteration 3: Fixed type error in src/asdl/cli/main.py — all checks pass
```

## Reporting Formats

### Success

```
## internal-code-just-fix: SUCCESS

All checks passed after N iteration(s):

- **Lint (ruff check)**: PASSED
- **Format (ruff format)**: PASSED
- **Format (dprint)**: PASSED
- **Type check (ty)**: PASSED
- **Tests (pytest)**: PASSED
```

### Stuck

```
## internal-code-just-fix: STUCK

Unable to resolve the following after N attempts:

**Check**: [lint / format / ty / test]
**Error**: [exact error message]
**File**: [path if applicable]

**Attempted fixes**:
1. [first attempt]
2. [second attempt]
3. [third attempt]

**Suggested next steps**: [what the user should look at]
```
