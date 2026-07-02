---
name: objective-autorun
disable-model-invocation: true
description: "Parent orchestration loop for driving one sdl Objective through repeated `sdl objective exec runner-step` invocations with a judgment checkpoint between steps. Use for \"run this objective\", \"drive the objective forward\", \"execute the autoobjective\", or \"run N runner steps\". For a single step use objective-runner-step; for tracking edits use objective-update; for advice on what to do next use objective-next."
---

# objective-autorun

Drive one sdl Objective forward through repeated verified runner steps. You are the **parent** for the whole run: each step is executed by `sdl objective exec runner-step` (one child session, one verified commit, one Runner Checkpoint), and you make every between-step decision — continue, recover, update tracking, stop, or ask the human.

Part of the Objective skill family. Use the `objective` umbrella skill first for shared vocabulary and safety rules, and the `objective-runner-step` skill for the per-step contract (flags, checkpoint zones, exit codes, post-checkpoint playbook). This skill owns only the loop around it.

This is parent-judgment iteration per ADR 0022, not batch mode. The runner deliberately has no multi-step or retry behavior; the loop exists only as your repeated, judged re-invocation. Never degrade it into an unattended batch controller: no re-invocation without reading the previous checkpoint and making an explicit continue decision.

## Before the run

1. **Select the Objective** by explicit slug/path per the umbrella skill's selection rules. Read its `objective.md`, `roadmap.md`, `orientation.md` (if present), and any `## Runner Policy` / `## Definition of Progress` sections (see the `objective` skill's `references/execution-policy.md`). Stop/ask boundaries live in that prose — consume them; do not invent your own.
2. **Capture the launch scope** from the user: which roadmap slice(s) to pursue, an optional step budget ("run 3 steps" is a hard cap, never a quota to fill), and any standing guidance to carry into every step.
3. **Check preconditions**: Objective open, worktree clean, HEAD on the named branch the first step should build on. The runner enforces these too (LBYL), but a refusal you could have predicted is a wasted invocation.

## The loop

Each iteration:

1. **Derive guidance.** From the roadmap's active slice, the Objective's policy prose, and prior checkpoints, write a thin, judgment-bearing `--guidance` for this step: what slice to take, what the last step left behind, what to avoid. Do not restate the Objective — the child reads it itself.
2. **Invoke one step** from the branch the previous step produced (stacking is emergent; the runner holds no cross-step state):

   ```bash
   sdl objective exec runner-step <slug> [--guidance <text|@file>] > checkpoint.md 2> progress.log
   ```

   The invocation is blocking and slow — a full child implementation session. Do not treat silence as a hang.
3. **Read the checkpoint and decide**, using the `objective-runner-step` post-checkpoint playbook verbatim: `committed` → judge the verified facts and claimed narrative, then continue or stop; `verification-failed`/`blocked` → recover (biased default, with sharpened guidance), hand-fix, reset, or escalate; `stop` → honor the child's reason; `malfunction` → read diagnostics and check the worktree before anything else, and escalate on repetition.
4. **Judge Semantic Updates.** After a step with material Objective impact, record it through the `objective-update` skill and commit that update yourself. Most committed steps need none; updates are learning and decision records, not step changelogs.

## Stop conditions

Stop the loop — and say why — when any of these holds:

- The target slice or the Objective's completion criteria are met.
- The child reported `stop`, and its reason survives your judgment.
- The user's step budget is exhausted.
- Two consecutive recovery attempts on the same step failed.
- A checkpoint reveals a design problem, a scope boundary, a public compatibility surface, an external write, or anything the Objective's Runner Policy marks stop/ask.
- Repeated malfunctions.

When stopping for judgment reasons, report to the human rather than grinding: a stopped run with a clear reason is a success of the loop, not a failure.

## End of run

Finish with a run report: steps run and their statuses, the branch stack and commits produced, Semantic Updates written, open risks or blockers, and your recommended next action. Leave HEAD on the last step's branch.

## Hard boundaries

- One judgment checkpoint per step: never re-invoke without reading the previous checkpoint and deciding.
- Never push, submit, publish, or merge — the run ends with local stacked branches handed back to the normal Graphite/flow workflow.
- Never commit on trunk; never write Objective tracking silently — tracking goes through `objective-update` only.
- Stop conditions come from the Objective's prose and the list above, not from optimism about the next step.
