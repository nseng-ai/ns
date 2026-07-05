---
name: objective-autorun
disable-model-invocation: true
description: "Parent orchestration loop for driving one ns Objective through repeated decomposed runner steps (`runner-begin` → subagent → `runner-finish`) with a judgment checkpoint between steps. Use for \"run this objective\", \"drive the objective forward\", \"execute the autoobjective\", or \"run N runner steps\". For a single step use objective-runner-step; for tracking edits use objective-update; for advice on what to do next use objective-next."
---

# objective-autorun

Drive one ns Objective forward through repeated verified runner steps. You are the **parent** for the whole run: each step is one begin → subagent → finish cycle (one implementation subagent, one local verified commit, one Runner Checkpoint), and you make every between-step decision — base branch, continue, recover, update tracking, stop, ask the human, or do any later push/submit/handoff outside the runner.

Part of the Objective skill family. Use the `objective` umbrella skill first for shared vocabulary and safety rules, and the `objective-runner-step` skill for the per-step contract (the three-phase flow, flags, checkpoint zones, exit codes, post-checkpoint playbook). This skill owns only the loop around it.

This is parent-judgment iteration per ADR 0022/0024, not batch mode. The runner deliberately has no multi-step or retry behavior; the loop exists only as your repeated, judged re-invocation. Never degrade it into an unattended batch controller: no new step without reading the previous checkpoint and making an explicit continue decision.

## Before the run

1. **Select the Objective** by explicit slug/path per the umbrella skill's selection rules. Read its `objective.md`, `roadmap.md`, `orientation.md` (if present), and any `## Runner Policy` / `## Definition of Progress` sections (see the `objective` skill's `references/execution-policy.md`). Stop/ask boundaries live in that prose — consume them; do not invent your own.
2. **Capture the launch scope** from the user: which roadmap slice(s) to pursue, an optional step budget ("run 3 steps" is a hard cap on begin→finish cycles, never a quota to fill), and any standing guidance to carry into every step.
3. **Check preconditions**: Objective open, worktree clean, HEAD on the named branch the first step should build on. `runner-begin` enforces these too (LBYL), but a refusal you could have predicted is a wasted invocation.
4. **Pick a step-artifact home**: the harness scratchpad (outside the repo worktree), with numbered per-step pairs — `step-<n>-facts.json` and `step-<n>-report.json`. Every attempt, including every `--recover` attempt, gets a fresh report path; begin refuses a used one.

## The loop

Each iteration:

1. **Derive guidance.** From the roadmap's active slice, the Objective's policy prose, and prior checkpoints, write a thin, judgment-bearing `--guidance` for this step: what slice to take, what the last step left behind, what to avoid. Do not restate the Objective — the subagent reads it itself.
2. **Run one step** from the branch the previous step produced (stacking is emergent; the runner holds no cross-step state). The parent owns the base branch and next-step decision; the child owns only the one implementation branch during its dispatch; the runner owns verification, staging, and the local commit handoff. Run the step per the `objective-runner-step` contract:

   ```bash
   ns objective exec runner-begin <slug> [--guidance <text|@file>] \
     --report-path <scratch>/step-<n>-report.json --format json > <scratch>/step-<n>-facts.json
   ```

   Dispatch a subagent in this worktree with the facts' `prompt` verbatim — the harness shows its progress live, so the human watches the step as it happens. While it runs, touch nothing in the worktree. When it returns:

   ```bash
   ns objective exec runner-finish <slug> --facts @<scratch>/step-<n>-facts.json
   ```

3. **Read the checkpoint and decide**, using the `objective-runner-step` post-checkpoint playbook verbatim: `committed` → judge the verified facts and claimed narrative, then continue or stop; `verification-failed`/`blocked` → recover (biased default: begin again with `--recover`, sharpened guidance, and a new report path), hand-fix, reset, or escalate; `stop` → honor the subagent's reason; `malfunction` → read diagnostics and check the worktree before anything else, and escalate on repetition.
4. **Judge Semantic Updates.** After a step with material Objective impact, record it through the `objective-update` skill and commit that update yourself — between steps only, never between begin and finish. Most committed steps need none; updates are learning and decision records, not step changelogs.

## Stop conditions

Stop the loop — and say why — when any of these holds:

- The target slice or the Objective's completion criteria are met.
- The subagent reported `stop`, and its reason survives your judgment.
- The user's step budget is exhausted.
- Two consecutive recovery attempts on the same step failed.
- A checkpoint reveals a design problem, a scope boundary, a public compatibility surface, an external write, or anything the Objective's Runner Policy marks stop/ask.
- Repeated malfunctions.

When stopping for judgment reasons, report to the human rather than grinding: a stopped run with a clear reason is a success of the loop, not a failure.

## End of run

Finish with a run report: steps run and their statuses, the local branch stack and commits produced, Semantic Updates written, open risks or blockers, and your recommended next action. Leave HEAD on the last step's branch. Do not push, submit, open PRs, or launch a separate handoff unless the human separately asks after the runner run report.

## Hard boundaries

- One judgment checkpoint per step: never begin the next step without reading the previous checkpoint and deciding.
- Never push, submit, publish, merge, open PRs, or perform write-capable external actions — the run ends with local stacked branches handed back to the normal Graphite/flow workflow. In particular, no `git push`, `gt submit`, `gh pr create`, `ns flow submit`, or PR leaves the machine from an autorun.
- Never commit on trunk; never write Objective tracking silently — tracking goes through `objective-update` only, between steps.
- Never mutate the worktree between a step's begin and finish; the gate fails the step loudly if you do.
- Stop conditions come from the Objective's prose and the list above, not from optimism about the next step.
