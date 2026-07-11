---
name: code-fix-gh-stack
description: "Run a disciplined Graphite/GitHub stack repair loop: query PR checks, fix the lowest/downstack failing check first, submit with Graphite, wait/re-query, and repeat until the stack is green."
metadata:
  internal: true
---

# code-fix-gh-stack

Use this skill when the user asks to fix, green, repair, or stabilize a Graphite/GitHub PR stack.

## Purpose

Turn the current Graphite/GitHub stack green by repairing the lowest failing PR first, submitting,
waiting for checks, then walking upward until the stack is green.

## Core loop

1. **Inventory the stack**
   - Use `ns slot gt exec stack-branches --format json` for structured current-stack topology.
   - Use `gt branch info --no-interactive` for concise current-branch PR, submission, and restack presentation, never as machine-readable topology.
   - Use `gt parent --no-interactive` or `gt children --no-interactive` for immediate-edge questions.
   - Use `gt ls` only as optional human visual confirmation.
   - Pass the discovered branch names to `ns address exec branch-pr-checks --branches-json ... --format json` or equivalent stack-check tooling to list remote PR checks.
   - Classify each PR as:
     - green/ready;
     - failing checks;
     - pending checks;
     - unresolved review threads;
     - needs restack/local divergence.

2. **Pick the lowest actionable failure**
   - Start closest to trunk.
   - Prefer actual failing CI/checks over upstack failures likely caused by downstack red.
   - If a lower PR is only pending, wait/re-query before fixing an upstack failure that may be derivative.
   - Treat unresolved review threads as blockers after checks are green, unless they are clearly obsolete and can be resolved with evidence.

3. **Checkout the branch**
   - `gt checkout <branch>`
   - Confirm status:
     - `git status --short --branch`
     - no interrupted rebase;
     - no accidental dirty files.

4. **Inspect the failing signal**
   - Prefer exact CI logs:
     - `gh run view <run-id> --job <job-id> --log-failed`
   - For review failures, download and inspect feedback:
     - `ns address exec download-feedback --pr-number <n> --format json`
   - Reproduce locally with the narrowest matching gate:
     - dprint: `just dprint-check`
     - TS format: `just ts-format-check`
     - TS type/test: `just ts-check`, `just ts-test`
     - integration: `just ts-test-integration`
     - style guard: `just ts-test-typescript-style-guard`

5. **Fix only this branch's blocker**
   - Keep the change scoped to the branch's semantic purpose.
   - Do not opportunistically rewrite upstack behavior.
   - If the failure is semantic and not obvious, continue diagnosing until the precise decision is known; ask only when a real product/design choice is required.

6. **Validate locally**
   - Run the exact failing gate.
   - Also run any cheap adjacent gate that protects the touched area.
   - If formatter fails, use repo autofix:
     - `just dprint-fix`
     - `just ts-format-fix`

7. **Amend with Graphite**
   - Stage files.
   - `gt modify -m "<clear message>"`
   - If Graphite restacks and conflicts:
     - resolve conflicts carefully;
     - `gt add <file>`;
     - `gt continue`;
     - re-run local validation for the affected branch.

8. **Submit**
   - `gt submit --no-interactive`
   - Never use raw `git push` for stack updates.

9. **Wait/re-query**
   - Re-query PR checks.
   - Do not assume submitted means fixed.
   - Move to the next lowest PR with failing checks.
   - Repeat until all PRs are green or only pending.

## Stop conditions

Stop and report clearly when:

- a semantic product/design choice is required;
- local validation cannot reproduce CI and logs are insufficient;
- Graphite/restack state is unsafe or conflicted beyond the current branch;
- another worktree owns the branch needed for the next fix;
- external mutation beyond `gt submit` or approved review-thread resolution is required.

## Done definition

The stack is green only when:

- every PR in the target stack has no failing required checks;
- pending checks have completed successfully;
- review/check-run blockers are resolved or explicitly classified non-blocking;
- Graphite mergeability is not blocked by stack inconsistency.
