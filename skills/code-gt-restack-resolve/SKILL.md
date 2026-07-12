---
name: code-gt-restack-resolve
disable-model-invocation: true
description: "Restack the current Graphite stack with conflict resolution — full stack by default like `gt restack`, downstack on request. Auto-merge mechanically-safe conflicts (verified with project checks), escalate ambiguous ones. Use for 'restack and resolve conflicts', 'intelligent/auto restack', 'full restack', 'whole-stack restack', 'downstack restack', or a restack expected to conflict."
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

## Harness entry points

- **Pi users:** `/code:gt-restack-resolve` is the single command entry point.
  The Pi command is a thin deterministic wrapper: it checks for an interrupted
  rebase, runs plain `gt restack` when safe, and invokes this skill only when
  conflict resolution is needed.
- **Claude Code, Codex, and other harnesses:** invoke this skill directly. Do
  not depend on the Pi wrapper. Follow the workflow below from the current
  repository state: if no rebase is in progress, start the selected restack;
  if a restack/rebase is already interrupted, resume from that state.

## Engine parameters

The driver facts the engine consumes — continue command, extra bail-out
condition (any conflict in a branch **outside the selected scope**, e.g. an
upstack branch during downstack scope or a sibling/unrelated stack during any
scope), escalation channel (`return-to-parent`; an escalating subagent leaves
the rebase stopped, returns the engine's structured payload, and does not run
`gt continue`) — travel in the **Agent prompt template** below, which is their
single source. Model selection lives in **Subagent model routing**.

Parent-facing post-completion checks: `git status` is clean;
`ns slot gt exec stack-branches --format json` answers structured topology;
`gt log` / `gt ls` may be used only as visual confirmation.

<!-- TEMPORARY (TS toolchain rollout) — remove once the oxlint/oxfmt/native-tsc
     toolchain commits have fully landed and no longer sit unrebased under
     active stacks. -->

## TEMPORARY: TS toolchain-rollout conflicts

While the TypeScript toolchain rollout (pnpm 11 / oxlint / oxfmt / native-tsc)
is still propagating through stacks, restacks hit a recurring conflict shape: a
**formatting-only** oxfmt reflow of the *old* code replays onto a base that
gained real feature logic on the same statements. The operative resolution rule
lives in the TEMPORARY block of the **Agent prompt template** below and travels
verbatim in every conflict subagent's prompt; it is the only auto-resolution the
driver may apply without escalating.

## Scope and non-goals

- **Scope must be explicit.** Default to **full** for generic restack requests,
  matching plain `gt restack`; use **downstack** only when the user asks for the
  narrower ancestors/current scope or confirms a prompt.
- **A single-PR (or tip) stack has no scope decision** — see the single-PR rule
  in **Choose scope**.
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
  branch errors with a `gt track` hint. Display output is never a machine
  source (see `docs/conventions/graphite-dependency-boundary.md`).
- **If a rebase is already in progress** (`git status` shows "interactive rebase
  in progress" / "Unmerged paths"), do **not** start a new restack — jump
  straight to the **Loop** at the resolve step, following the `graphite` skill's
  "Recovering from Interrupted Rebase (Context Reset)" section.

### 2. Choose scope

Set `RESTACK_SCOPE` before running any restack command.

| User intent                                                                                    | Scope            | Slot consolidation command          | Restack command          |
| ---------------------------------------------------------------------------------------------- | ---------------- | ----------------------------------- | ------------------------ |
| Generic "restack and resolve", "restack", "intelligent/auto restack", or ambiguous request     | `full` (default) | `ns slot gt free-stack`             | `gt restack`             |
| Explicit "downstack restack", "ancestors only", "rebase up to where I am", or confirmed prompt | `downstack`      | `ns slot gt free-stack --downstack` | `gt restack --downstack` |

Rules:

- **Single-PR / tip stacks: never ask about scope.** *Before* choosing scope or
  prompting, run `gt children --no-interactive` for the current branch. If it
  succeeds with empty stdout, no branch is stacked directly above the current
  branch, so full and downstack are the **same** operation: skip the scope
  question entirely and run plain `gt restack` (no `--downstack` needed — the
  result is identical). There are no upstack slots to free either, so skip the
  consolidation prompt too unless an in-scope **ancestor** is checked out in
  another slot. If richer topology is needed, use
  `ns slot gt exec stack-branches --format json` instead of reading display output.
- When in doubt, ask — **but only when scope actually changes the outcome**
  (i.e., the current branch has upstack descendants).
- Do not auto-checkout to the tip. Run the command from the user's current
  branch unless they explicitly ask to move first.

### 3. Multi-slot consolidation

In this repo a stack's branches can be checked out across multiple worktree
**slots**, which locks them against rebasing. A restack can fail when another
slot has a branch in the selected scope checked out, so run the slot
consolidation command from the **Choose scope** table before looping.

In the single-PR / tip case, skip this step per the single-PR rule in
**Choose scope**.

The `ns slot gt free-stack` command is **mutating**: it releases matching slots by
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

When the harness supports per-dispatch model selection, request the model below
for these restack conflict subagents. Concrete examples:

- Claude Code: launch the `Agent` conflict-resolution subagent on Opus
  (use the Claude Code `opus` selector available in the current installation).
- OpenAI Codex-backed Pi: call `subagent` with `agent: "task"` and set `model` to
  `openai-codex/gpt-5.6-sol:high` (or the local equivalent Sol model pattern).
- Anthropic-backed Pi: call `subagent` with `agent: "task"` and set `model` to
  the current `claude-opus` model (or the local equivalent Opus model pattern).

If per-dispatch model selection is unavailable, continue with the session's
current model but mention that no explicit smart model could be requested.

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

TEMPORARY (TS toolchain rollout): if a conflict is purely a formatting-only
oxfmt/toolchain reflow of the OLD code shape replaying onto a base that gained
real feature logic on the same statements, resolve it deterministically by
KEEPING the base (HEAD) logic verbatim, discarding the reverted incoming code,
then re-applying formatting by running `just ts-format-fix` (not by
hand-wrapping). This is the only "keep + reformat" auto-resolution allowed; any
conflict where the incoming side carries genuine logic still escalates.

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

- Run a final `git status` (clean) and `ns slot gt exec stack-branches --format json`
  for structured topology confirmation. `gt log` / `gt ls` may be shown as
  human visual confirmation only.
- Regenerate any auto-generated files that were touched (per
  `code-resolve-merge-conflicts` step 7) and stage/commit them as appropriate.
- For a **full-scope** restack, the final-verification rule is binary: if any
  conflict was resolved anywhere in the restack, run a final scoped
  verification from the stack tip after the restack completes; if the whole
  restack replayed conflict-free, skip it. This covers upstack branches that
  replayed without conflicts but now sit atop resolved code. Use the engine's
  step-4 check rule
  (`code-resolve-merge-conflicts`, "Verify before continuing"), scoped by the
  file types conflicted across the whole restack.

### 6. Bail-out

The engine's bail-out policy applies, plus this driver's extra condition from
**Engine parameters** (a conflict outside the selected scope). Summarize per
the engine: what was resolved, what remains, and the exact command/state you
stopped at.
