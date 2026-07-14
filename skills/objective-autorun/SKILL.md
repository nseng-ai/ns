---
name: objective-autorun
disable-model-invocation: true
description: "Parent orchestration loop for driving one ns Objective through repeated decomposed runner steps (`runner-begin` → subagent → `runner-finish`) with a judgment checkpoint between steps. Use for \"run this objective\", \"run N runner steps\", or \"implement this Objective as a stack\" (each committed step stacks on the last), including when the Pi /ns:objective:autorun picker injects an explicit slug. For a single step use objective-runner-step; for tracking edits use objective-update; for advice on what to do next use objective-next."
---

# objective-autorun

Drive one ns Objective forward through repeated verified runner steps. You are the **parent** for the whole run: each step is one begin → subagent → finish cycle (one implementation subagent, one local verified commit, one Runner Checkpoint), and you make every between-step decision — base branch, continue, recover, update tracking, stop, ask the human, or invoke a separately authorized parent-only publisher after the checkpoint.

Use the `objective` umbrella skill first for shared vocabulary and safety rules, and the `objective-runner-step` skill for the per-step contract (the three-phase flow, flags, checkpoint zones, exit codes, post-checkpoint playbook). This skill owns only the loop around it.

This is parent-judgment iteration per ADR 0022/0024, not batch mode. The runner deliberately has no multi-step or retry behavior; the loop exists only as your repeated, judged re-invocation.

## Before the run

1. **Select the Objective** by explicit slug/path per the umbrella skill's selection rules. Read its `objective.md`, `roadmap.md`, `orientation.md` (if present), and any `## Runner Policy` / `## Definition of Progress` sections (see the `objective` skill's `references/execution-policy.md`). Stop/ask boundaries live in that prose — consume them; do not invent your own.
2. **Capture the launch scope** from the user: which roadmap slice(s) to pursue, an optional step budget ("run 3 steps" is a hard cap on begin→finish cycles, never a quota to fill), and any standing guidance to carry into every step.
3. **Preview and confirm.** Before the first begin, present a compact launch preview — the selected slug, the roadmap slice(s) in scope with one-line theses, the step budget if any, expected validation posture, exact stop conditions, and publication posture — and wait for an explicit affirmative (`yes`, `proceed`, or a clear equivalent). Publication defaults to off: say that push/submit/PR actions will not happen. If the scope changes materially mid-run, stop and re-preview.
4. **Bind publication only when explicitly requested and available.** The conditional ADR 0037 path requires durable Runner Policy permission plus a second exact human confirmation naming the selected slug, current non-trunk branch, already-existing PR number/URL/head branch, local launch HEAD, and remote PR head. The trusted parent supplies the policy attestation; no command parses the prose. Store the validated authorization only in a fresh outside-repo scratch directory for this invocation. If the parent bind/publish capability is not implemented or any fact is missing or drifts, keep the run local-only; never substitute raw write commands.
5. **Check preconditions**: Objective open, worktree clean, HEAD on the named branch the first step should build on. `runner-begin` enforces these too (LBYL), but a refusal you could have predicted is a wasted invocation.
6. **Pick a step-artifact home**: the harness scratchpad (outside the repo worktree), with numbered per-step pairs — `step-<n>-facts.json` and `step-<n>-report.json`. Every attempt, including every `--recover` attempt, gets a fresh report path; begin refuses a used one. Publication authorization and cumulative-summary artifacts, when enabled, stay parent-held in that outside-repo scratch directory and never enter tool parameters, child prompts, or child session context.

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

3. **Read the checkpoint and decide**, using the `objective-runner-step` post-checkpoint playbook verbatim. Parent-loop deltas: every recovery attempt gets sharpened guidance and a fresh report path; two consecutive failed recoveries on the same step end the run (Stop conditions).
4. **Judge Semantic Updates.** After a step with material Objective impact, record it through the `objective-update` skill and commit that update yourself — between steps only, never between begin and finish. Most committed steps need none; update judgment lives in the `objective-runner-step` skill and the umbrella's `updates/` rules.
5. **Publish only after judgment, when the launch was bound.** Never publish a `stop`, `blocked`, `verification-failed`, or `malfunction` checkpoint. After a `committed` checkpoint and completed tracking judgment, update the typed cumulative parent summary from runner-attested commits and validation, optional tracking commits, and every escalatable parent decision. Invoke only the implemented parent publisher with the bound authorization. A push failure stops publication; push success plus PR-summary failure is a precise successful-partial outcome, advances the chained authorization head, and does not itself stop later Runner steps. Carry the complete cumulative summary so a later successful update heals the managed section. Never roll back or force-push.

## Stop conditions

Stop the loop — and say why — when any of these holds:

- The target slice or the Objective's completion criteria are met.
- The subagent reported `stop`, and its reason survives your judgment.
- The user's step budget is exhausted.
- Two consecutive recovery attempts on the same step failed.
- A checkpoint reveals a design problem, a scope boundary, a public compatibility surface, an unbound external write, or anything the Objective's Runner Policy marks stop/ask.
- Repeated malfunctions.

When stopping for judgment reasons, report to the human rather than grinding: a stopped run with a clear reason is a success of the loop, not a failure.

## End of run

When the run stops, best-effort remove any parent-held publication authorization/summary scratch artifacts so the invocation grant expires, then read `references/run-digest.md` and finish with the `## Autorun digest` run report it specifies. Leave HEAD on the last step's branch. Do not launch a separate handoff, submit a stack, or perform any external action beyond an explicitly bound publication outcome already authorized for this invocation.

## Hard boundaries

- One judgment checkpoint per step: never begin the next step without reading the previous checkpoint and deciding.
- Canonical child/Runner-step forbidden-action wording (deliberately duplicated verbatim from the runner prompt's forbidden-actions rule): "Do not push, submit, publish, merge, land, create or update pull requests, or perform any other write-capable external action — no `git push`, `gt submit`, `gh pr create`, `ns flow submit`, or PR mutation may be run by the implementation child or from inside an Objective Runner step. The child has no publication authority; `runner-finish` owns only the verified local commit. Any authorized publication is a distinct parent-only action after the Runner Checkpoint, parent judgment, and completion of any material Objective tracking."
- Parent publication is off by default, requires both durable policy permission and exact launch confirmation, stays bound to one Objective/branch/existing PR/invocation, and cannot broaden into PR creation, Graphite submit/restack, force-push, merge/land, deployment, rollback, or arbitrary writes.
- Never commit on trunk; never write Objective tracking silently — tracking goes through `objective-update` only, between steps.
- Never mutate the worktree between a step's begin and finish; the gate fails the step loudly if you do.
- Stop conditions come from the Objective's prose and the list above, not from optimism about the next step.
