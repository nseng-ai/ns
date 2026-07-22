---
name: code-fix-gh-stack
description: "Use when the user asks to fix, green, repair, or stabilize a Graphite/GitHub PR stack."
metadata:
  internal: true
---

# code-fix-gh-stack

Repair loop for a Graphite/GitHub PR stack: work lowest-first, fix one branch's blocker at a time, and judge every check through **Reading checks**. The stack is done only per the **Done definition** — one definition, checks-only.

## Core loop

1. **Inventory the stack**
   - Use `ns slot gt exec stack-branches --format json` for structured current-stack topology.
   - Use `gt parent --no-interactive` or `gt children --no-interactive` for immediate-edge questions.
   - Treat `gt branch info --no-interactive` and `gt ls` as human presentation; take machine-readable topology from `stack-branches` (see `docs/conventions/graphite-dependency-boundary.md`).
   - Pass the discovered branch names to `ns address exec branch-pr-checks --branches-json ... --format json` to list remote PR checks.
   - Classify each PR using **Reading checks**: green; fresh-failing; pending; needs restack/local divergence. Record each PR's unresolved review-thread count for the final report — thread handling belongs to the `pr-address` processes, outside this loop.

2. **Pick the lowest actionable failure**
   - Start closest to trunk: downstack red usually explains upstack red.
   - Act only on fresh failures (**Reading checks**); a stale failure needs a current-head run before it counts as evidence.
   - If a lower PR is only pending, let it settle first (`ns address exec wait-for-checks` scoped to that branch, step 9) before touching an upstack failure that may be derivative.

3. **Checkout the branch**
   - `gt checkout <branch>`
   - Confirm a clean start: `git status --short --branch` reports a clean tree with no rebase in progress.

4. **Inspect the failing signal**
   - Prefer exact CI logs: `gh run view <run-id> --job <job-id> --log-failed`
   - When a failure's explanation lives in PR feedback (for example a review bot), download it: `ns address exec download-feedback --pr-number <n> --format json`
   - Reproduce locally with the narrowest matching gate per `docs/conventions/just-gate-map.md`.

5. **Fix only this branch's blocker**
   - Keep the change scoped to the branch's semantic purpose; upstack behavior gets fixed on its own branch when its turn comes.
   - If the failure is semantic and not obvious, keep diagnosing until the precise decision is known; ask only when a real product/design choice is required.

6. **Validate locally**
   - Run the exact failing gate, plus any cheap adjacent gate that protects the touched area.
   - If a formatter fails, use repo autofix: `just dprint-fix`, `just ts-format-fix`.

7. **Amend with Graphite**
   - Stage files, then `gt modify -m "<clear message>"`.
   - Verify the amend landed: `git status --short` is clean and the fix is visible in `git show --stat`.
   - If Graphite restacks into conflicts, resolve by the **Conflict canon**, then re-run local validation for the affected branch.

8. **Submit**
   - Use `gt submit --no-interactive` instead of `git push` / `gh pr create` (canonical wording: the setup-graphite admonition payload).

9. **Wait for checks to settle**
   - Pass the stack's branch names to
     `ns address exec wait-for-checks --branches-json ... --format json`. It polls the
     branches' PR checks (defaults: every 15s, up to 900s; tune with
     `--interval-seconds`/`--timeout-seconds`) and returns once with an `outcome`:
     - `passing` (exit 0): every check concluded green;
     - `failing` (exit 1): a check failed or was cancelled, reported as soon as observed;
     - `timeout` (exit 1): checks still pending at the deadline;
     - `mapping-gap` (exit 1): a branch has no or multiple open PRs.
   - `wait-for-checks` is the loop's only settle mechanism: a submitted branch counts as fixed when it returns `passing` for that branch.
   - On `failing`, return to step 2 with the next lowest fresh failure (per-branch counts are in the returned entries).
   - On `timeout`, re-invoke wait-for-checks or report the still-pending checks; a timeout leaves the stack unsettled, not green.
   - Repeat until the **Done definition** holds.

## Reading checks

- **Fresh vs stale.** A failing check is evidence only when it ran against the current head. Compare the check's `started_at` (check runs) or `created_at` (status contexts) from `branch-pr-checks` with the branch head's latest push — in this loop, your most recent `gt submit` of that branch. At-or-after the push is **fresh** and actionable; before it is **stale** — the verdict of a previous head. For a stale failure, wait for the current-head run (step 9) instead of fixing from the old log.
- **Trailing.** A pending `Graphite / mergeability_check` is a trailing signal: it settles on Graphite's side as downstack PRs merge and submits propagate. Read actionable pending as pending minus trailing; the Graphite context alone is neither a failure to fix nor a reason to keep polling.
- **Review threads.** Unresolved review threads are inventory for the final report: count them per PR and route their handling to the `pr-address` processes. Fixing checks is this loop's whole contract.

## Conflict canon

When a Graphite restack conflicts:

- The already-submitted downstack shape is canonical: resolve each conflict toward what the downstack branches already carry, and re-express this branch's change on top of it.
- Commits whose content already exists downstack are duplicates: skip them, keeping only this branch's own delta.
- Run the mechanics through `code-gt-restack-resolve` from the conflicted state, then re-run local validation for the affected branch.

## Delegation

- Delegate mechanical sweeps to a subagent when the harness provides one: validation gates across branches, submit sweeps after a downstack amend, and CI-log digs that end in an excerpt.
- Keep conflict resolution and semantic fixes in the main session: they carry the judgment this loop exists to apply.

## Stop conditions

Stop and report clearly when:

- a semantic product/design choice is required;
- local validation cannot reproduce CI and logs are insufficient;
- Graphite/restack state is unsafe or conflicted beyond the current branch;
- another worktree owns the branch needed for the next fix;
- external mutation beyond `gt submit` is required.

## Done definition

The stack is green when every PR in the target stack has zero fresh failing checks and its pending checks are either concluded green or trailing-only (**Reading checks**). This is the loop's single definition of done — checks only.

The final report inventories, without owning:

- per-PR unresolved review-thread counts, routed to the `pr-address` processes;
- any `warnings` from `ns slot gt exec stack-branches --format json`.
