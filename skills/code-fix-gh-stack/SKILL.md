---
name: code-fix-gh-stack
description: "Use when the user asks to fix, green, repair, or stabilize a Graphite/GitHub PR stack."
metadata:
  internal: true
---

# code-fix-gh-stack

## Core loop

1. **Inventory the stack**
   - Use `ns slot gt exec stack-branches --format json` for structured current-stack topology.
   - Use `gt parent --no-interactive` or `gt children --no-interactive` for immediate-edge questions.
   - `gt branch info --no-interactive` and `gt ls` are human presentation only, never machine-readable topology (see `docs/conventions/graphite-dependency-boundary.md`).
   - Pass the discovered branch names to `ns address exec branch-pr-checks --branches-json ... --format json` to list remote PR checks.
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
   - Reproduce locally with the narrowest matching gate per `docs/conventions/just-gate-map.md`.

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
