---
name: code-gt-restack-resolve
description: "Restack the current Graphite stack with conflict resolution — full stack by default like `gt restack`, downstack on request. Auto-merge mechanically-safe conflicts (verified with project checks) and escalate ambiguous ones. Use for 'restack and resolve conflicts', 'intelligent/auto restack', 'full restack', 'whole-stack restack', 'downstack restack', or a restack expected to conflict."
model: opus
---

# code-gt-restack-resolve

Drive a Graphite restack semi-autonomously with an explicit **scope**:
**full stack** by default, matching plain `gt restack`, or **downstack** when
the user asks for the narrower ancestors/current scope.

This skill is a **parent-session driver**: the main agent session owns the
restack workflow — preflight, scope, slot consolidation, starting or resuming
the loop, interpreting subagent reports, user-facing escalation, final
validation, and gt-specific bail-outs. Each individual conflict stop is
delegated to one fresh, same-worktree subagent that follows the engine skill,
**`code-resolve-merge-conflicts`**
(`skills/code-resolve-merge-conflicts/SKILL.md`), with the **Engine parameters**
below. Do not restate or improvise per-file resolution policy here.

It also defers to **`graphite`** for the `gt` mental model, stack navigation,
and the "Recovering from Interrupted Rebase" section.

## Engine parameters

When the engine's Driver contract asks for overrides, use:

- **Continue command:** `gt continue`
- **Extra bail-out condition:** a conflict surfaces in a branch **outside the
  selected scope** (an upstack branch during downstack scope, or a
  sibling/unrelated stack during any scope)
- **Post-completion checks:** `git status` is clean; `slot gt exec stack-branches --format json` answers structured topology; `gt log` / `gt ls` may be used only as visual confirmation
- **Subagent model tier:** the strong/smart implementation tier; never the cheap/fast review tier
- **Escalation channel:** `return-to-parent`. A driven conflict subagent must
  not prompt the user. If escalation is required, it leaves the rebase stopped,
  returns the engine's structured escalation payload to the parent, and does
  not run `gt continue`.

## When to use

- "restack and resolve conflicts", "intelligent restack", "auto restack"
- "full restack", "whole-stack restack", "include upstack", "not just downstack"
- "downstack restack", "ancestors only", "rebase up to where I am"
- A `gt restack` (full stack or downstack) that is expected to hit conflicts
- Resuming a restack that was already interrupted mid-rebase

## Scope and non-goals

- **Scope must be explicit.** Default to **full** for generic restack requests,
  matching plain `gt restack`; use **downstack** only when the user asks for the
  narrower ancestors/current scope or confirms a prompt.
- **A single-PR (or tip) stack has no scope decision** — full and downstack
  differ only by upstack descendants. See the single-PR rule in **Choose
  scope**.
- **Full scope:** operate on the current Graphite stack as `gt restack` does
  (ancestors + current + descendants) — not every stack in the repo. This may
  rewrite upstack descendants, but that is the expected default for this skill.
- **Downstack scope:** operate on the chain trunk → current (ancestors +
  current). Upstack is not touched.
- **Never** `gt submit` / push / land.
- **Never** touch sibling stacks. Upstack descendants are in scope only for a
  full restack.
- **Never** `gt abort` without explicit confirmation (engine abort policy).

## Workflow

### 1. Preflight

- `git status` must show a **clean working tree** — a rebase cannot start dirty.
  If dirty, stop and ask the user to commit or stash first.
- Confirm the current branch is gt-tracked with non-display plumbing such as
  `gt parent --no-interactive` or `gt children --no-interactive`; an untracked
  branch errors with a `gt track` hint. Do not parse `gt ls`, `gt log`, or
  `gt branch info` display output for this decision.
- **If a rebase is already in progress** (`git status` shows "interactive rebase
  in progress" / "Unmerged paths"), do **not** start a new restack — jump
  straight to the **Loop** at the resolve step, following the `graphite` skill's
  "Recovering from Interrupted Rebase (Context Reset)" section.

### 2. Choose scope

Set `RESTACK_SCOPE` before running any restack command.

| User intent                                                                                    | Scope            | Slot consolidation command       | Restack command          |
| ---------------------------------------------------------------------------------------------- | ---------------- | -------------------------------- | ------------------------ |
| Generic "restack and resolve", "restack", "intelligent/auto restack", or ambiguous request     | `full` (default) | `slot gt free-stack`             | `gt restack`             |
| Explicit "downstack restack", "ancestors only", "rebase up to where I am", or confirmed prompt | `downstack`      | `slot gt free-stack --downstack` | `gt restack --downstack` |

Rules:

- **Single-PR / tip stacks: never ask about scope.** *Before* choosing scope or
  prompting, run `gt children --no-interactive` for the current branch. If it
  succeeds with empty stdout, no branch is stacked directly above the current
  branch, so full and downstack are the **same** operation: skip the scope
  question entirely and run plain `gt restack` (no `--downstack` needed — the
  result is identical). There are no upstack slots to free either, so skip the
  consolidation prompt too unless an in-scope **ancestor** is checked out in
  another slot. If richer topology is needed, use
  `slot gt exec stack-branches --format json` instead of reading display output.
- When in doubt, ask — **but only when scope actually changes the outcome**
  (i.e., the current branch has upstack descendants).
- Do not auto-checkout to the tip. Run the command from the user's current
  branch unless they explicitly ask to move first.

### 3. Multi-slot consolidation

In this repo a stack's branches can be checked out across multiple worktree
**slots**, which locks them against rebasing. A restack can fail when another
slot has a branch in the selected scope checked out, so run the slot
consolidation command from the **Choose scope** table before looping.

If the current branch has no upstack descendants (the single-PR / tip case from
**Choose scope**), skip this step entirely unless an in-scope **ancestor**
branch is itself checked out in another slot.

The `slot gt free-stack` command is **mutating**: it releases matching slots by
detaching them at trunk — `--format json` is a machine-readable record of what
was freed, not a dry-run. If the user has not already authorized freeing stack
slots, ask before running it.

### 4. Loop

If no rebase is currently in progress, start the restack with the command
chosen in **Choose scope**. If a rebase is already interrupted, skip the start
command and continue from the current conflict state.

After starting or resuming, run `git status` in the parent session to identify
the current state. In the happy path, the count invariant is: **one conflict
stop = one engine run = one `gt continue` = one subagent**. Escalation adds a
parent user round-trip and a follow-up subagent for that same stop.

While the restack is stopped at conflicts:

1. Launch exactly one fresh, same-worktree subagent for the current conflict
   stop using the **Agent prompt template** below and the **Subagent model
   routing** policy below. Do not launch conflict subagents in parallel; the
   current `gt continue` determines whether another conflict stop exists.
2. Await that subagent completely before launching any other subagent.
3. Inspect the subagent's final text/status, then re-run `git status` in the
   parent session. Do not blindly trust the final text.
4. Do not propagate an unverified behavior diagnosis or pre-existing failure
   claim as fact. If a subagent reports `behavior_evidence: unverified` or
   `preexisting_failure_evidence: unverified`, either independently verify the
   claim before using it as context/whitelist, or preserve the `unverified`
   label when asking the user, launching the next subagent, or summarizing.
   Unverified claims cannot become failure whitelists.
5. Branch on the observed outcome:
   - **advanced:** `gt continue` succeeded but the restack stopped again on a
     later conflict. Loop and launch a new subagent for that next stop.
   - **completed:** the restack completed. Proceed to **Done**.
   - **escalation:** ask the user in the parent conversation using the returned
     payload. Then launch a fresh follow-up subagent for the same stop, seeded
     with the user's decision, to apply the resolution, stage files, run
     `gt continue`, and report back. Re-run `git status` again afterward.
   - **bail:** stop and summarize what was resolved, what remains, and the
     exact command/state stopped at.

If `git status` shows no rebase in progress and no conflicts after the initial
restack command returns successfully, proceed directly to **Done**.

### Subagent model routing

Conflict-resolution subagents edit code in an interrupted rebase and decide
whether a merge is mechanically safe. They are implementation subagents, not
bounded classification or review helpers, so do not route them to the
cheap/fast model tier.

When the harness supports per-dispatch model selection, always request the
harness's configured strong/smart implementation model for these restack
conflict subagents. Concrete examples:

- OpenAI Codex-backed Pi: set `dispatch_runner_subagent.model` to
  `openai-codex/gpt-5.5:high` (or the local equivalent smart GPT-5.5 model
  pattern).
- Anthropic-backed Pi: set `dispatch_runner_subagent.model` to
  `claude-opus-4-8` (or the local equivalent smart Opus model pattern).

If per-dispatch model selection is unavailable, continue with the session's
current model but mention that no explicit smart model could be requested. Never
copy cheap-model guidance such as `openai-codex/gpt-5.4-mini:medium` into this
workflow.

### Agent prompt template

Use this structure for each sequential conflict-resolution subagent. Fill in
`RESTACK_SCOPE` from **Choose scope** and include any user decision when this is
a follow-up subagent after escalation.

```text
You are resolving one conflict stop for a Graphite restack that is already in
progress in this same worktree.

Orchestrator-decided facts:
- RESTACK_SCOPE: <full|downstack>
- Continue command: gt continue
- Extra bail-out condition: any conflict in a branch outside RESTACK_SCOPE
- Escalation channel: return-to-parent

Follow skills/code-resolve-merge-conflicts/SKILL.md as the conflict-resolution
engine with those driver parameters.

Agent-decided work:
- Inspect git status and identify the current stopped commit and conflicted
  files.
- Classify conflict regions using only the engine's safe categories.
- Edit only conflict regions, except generated files as allowed by the engine.
- Run the engine verification gate and conflict-marker sweep.
- Stage resolved files.
- Run gt continue if and only if verification passes and no escalation or
  bail-out condition blocks it.
- After gt continue, inspect git status only enough to classify the outcome.

Hard constraints:
- Do not prompt the user.
- Do not abort the rebase/restack.
- Do not resolve conflicts outside the current conflict stop.
- Run gt continue at most once. This is an audit boundary: if that continue
  reaches a new conflict stop, do not resolve it; return outcome=advanced with
  the new repository state.
- Do not use whole-file checkout except for generated files as allowed by the
  engine.

Output contract: end with this delimited result block, filling every line for
all outcomes:
--- CONFLICT SUBAGENT RESULT ---
outcome: advanced | completed | escalation | bail
files_resolved: <paths or none>
safe_categories_used: <categories or none>
verification: <commands and pass/fail results>
gt_continue_ran: yes | no
traceability_check: <base|incoming|intent-diff|mechanical-propagation|mixed; note "no novel logic" or describe any novel logic>
behavior_evidence: <not_applicable | observed: <command + concise output> | unverified: <reason>>
preexisting_failure_evidence: <not_applicable | observed: <base_sha + command + concise output> | unverified: <reason>>
summary: <concise summary>

For outcome=escalation, also include:
affected_file: <path>
both_sides: <concise conflict-region summary or quoted snippets>
intent_diff_summary: <what the incoming commit intended>
proposed_resolution: <proposal and reasoning>
why_outside_safe_set: <reason>
current_repository_state: <git status summary>
--- END CONFLICT SUBAGENT RESULT ---
```

### 5. Done

When the selected restack command reports there is nothing left to restack:

- Run a final `git status` (clean) and `slot gt exec stack-branches --format json`
  for structured topology confirmation. `gt log` / `gt ls` may be shown as
  human visual confirmation only; do not parse their display output for machine
  decisions.
- Regenerate any auto-generated files that were touched (per
  `code-resolve-merge-conflicts` step 7) and stage/commit them as appropriate.
- For a **full-scope** restack, run a final scoped verification from the stack
  tip after the restack completes, at least when any conflict was resolved
  mid-stack. This covers upstack branches that replayed without conflicts but
  now sit atop resolved code. Use the same categories as the Loop verification
  gate:
  - `ts/**` only → `just ts-check` (optionally `just ts-test`).
  - Python only → `just ty` + targeted `uv run pytest <affected package>`
    (or `just test`).
  - Mixed / uncertain → `just check`.
  - Docs / markdown only → **no check**.

### 6. Bail-out

The engine's bail-out policy applies, plus this driver's extra condition from
**Engine parameters** (a conflict outside the selected scope). Summarize per
the engine: what was resolved, what remains, and the exact command/state you
stopped at.
