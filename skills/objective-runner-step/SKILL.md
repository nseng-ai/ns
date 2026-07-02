---
name: objective-runner-step
disable-model-invocation: true
description: "Parent playbook for running one verified Objective implementation step via `sdl objective exec runner-step`. Use when driving an Objective forward step by step with runner checkpoints, recovering a failed runner step with --recover, or interpreting a Runner Checkpoint. For tracking edits use objective-update; for advice on what to do next use objective-next."
---

# objective-runner-step

Run one verified implementation step of an sdl Objective through a dispatched child session, then decide what happens next. You are the **parent**: the runner executes exactly one step and stops; every between-step decision — continue, recover, update tracking, ask the human — is yours.

Part of the Objective skill family. Use the `objective` umbrella skill first for shared vocabulary, selection rules, and storage model; this step is self-contained for its own happy path.

## What one step does

```bash
sdl objective exec runner-step <slug> [--recover] [--guidance <text|@file>] [--model <m>] [--timeout <seconds>]
```

The command dispatches a child session to implement one focused slice of the Objective, deterministically verifies the repository state the child left behind, creates the local commit itself (the child never commits), and prints a **Runner Checkpoint** to stdout. Runner-produced commits carry provenance trailers: `Objective-Runner-Step: <slug>`, plus `Objective-Runner-Mode: recover` for recovered attempts.

Flags:

- `<slug>` — the Objective slug (required positional).
- `--recover` — repair the dirty tree a failed step left behind instead of starting a fresh slice.
- `--guidance <value>` — parent judgment passed verbatim to the child. A value starting with `@` is always a file path (resolved against the current directory; unreadable file is a usage error); otherwise inline text. Valid in both modes.
- `--model <value>` — model override for the child session.
- `--timeout <value>` — child session timeout in seconds (default 3600). A timed-out child is a runner malfunction.
- `--format json` — emit the full machine result (including `checkpointMarkdown`) instead of the human checkpoint.

## Expectations before you run it

- **Blocking and slow.** One invocation runs a full child implementation session — typically minutes, up to the timeout. Do not treat silence as a hang.
- **stderr is live progress, stdout is the contract.** Child activity streams to stderr and is never part of the contract. The checkpoint Markdown is the only stdout in every terminal state that produces one. To capture cleanly: `sdl objective exec runner-step <slug> > checkpoint.md 2> progress.log`.
- **Run from the branch you want as the step's base.** The child creates its own implementation branch off the current branch via the Branch Context/Graphite path. Stacking is emergent: the runner holds no cross-step state, so the next step simply runs from the branch the previous step produced (where the command leaves you).
- **Preconditions are checked up front (LBYL).** Default mode refuses unless the Objective is open, the worktree is clean, and HEAD is on a named branch. `--recover` inverts the worktree requirement: it refuses unless the tree is dirty and the branch is not trunk. A refusal exits 1 with a message only — no checkpoint, nothing dispatched.

## Reading the Runner Checkpoint

The checkpoint has two labeled zones with different trust levels:

- **`## Verified facts (runner-attested)`** — trust these. Every line (mode, status, branch, commit, changed paths, gate checks, usage, diagnostics) is something the runner itself observed or performed.
- **`## Child-reported narrative (unverified claims)`** — the child's own report (Summary, Objective Impact, Risks/Blockers, Follow-Ups, Validation), verbatim. Treat it as claims, not facts. The Validation section describes what the child says it ran; nothing there is runner-attested.

The checkpoint title carries the typed status: `committed`, `stop`, `blocked`, `verification-failed`, or `malfunction`. On `verification-failed`, the verified zone lists each gate check as passed/failed/skipped (branch invariants, Graphite tracking, dirty worktree, `git diff --check`, HEAD unchanged) — read those results, not the narrative, to understand what went wrong.

## Exit codes

| Exit | Meaning                                                                                                                                                                                                                                                                                     | stdout                                                                                            |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 0    | `committed` (step verified and committed) or `stop` (child deliberately stopped; see the child-reported reason)                                                                                                                                                                             | checkpoint                                                                                        |
| 1    | `blocked` (child reported it cannot proceed) or `verification-failed` (gate checks failed); also precondition refusals (dirty tree in default mode, clean tree or trunk in `--recover`, closed Objective, detached HEAD)                                                                    | checkpoint for blocked/verification-failed; refusals print a message only, nothing was dispatched |
| 2    | Usage error (invalid/unknown slug, unreadable `@file` guidance — nothing dispatched, no checkpoint) or runner malfunction (child startup failure, timeout, nonzero child exit, unparseable/incomplete child report, commit failure — best-effort `malfunction` checkpoint with diagnostics) | malfunction checkpoint when one could be produced                                                 |

## Post-checkpoint playbook

After every invocation, read the checkpoint and make an explicit decision:

- **`committed`** — review the verified facts (branch, commit, changed paths) and the claimed narrative. If the work should continue, invoke the next step from the branch the step produced. Apply the Semantic Update judgment below first.
- **`verification-failed` or `blocked`** — the worktree is left exactly as the child left it. Choose one:
  1. **Re-dispatch with `--recover`** (the biased default): sharpen `--guidance` using the failed gate checks and diagnostics — say what went wrong and what the child must do differently. Recovery repairs on the same non-trunk branch; judgment stays in the parent, token burn in the child.
  2. **Hand-fix**: make the remaining changes yourself and commit them yourself (the runner will not commit a step it did not verify).
  3. **Reset**: discard the attempt (e.g. `git checkout -- .` / delete the branch) and re-run a fresh default-mode step with better guidance.
  4. **Escalate**: stop and ask the human when the failure signals a design problem, repeated identical failures, or anything outside the Objective's stated scope.
- **`stop`** — the child concluded the step should not proceed (see the child-reported reason). Decide whether to re-scope, re-run with guidance, or consult the human.
- **`malfunction`** — infrastructure or contract failure, not a work outcome. Read the diagnostics; check the worktree state before doing anything else. Repeated malfunctions are a reason to escalate, not retry blindly.

One slice per invocation, one attempt per invocation. There are no loops inside the runner; iteration is you re-invoking with better guidance.

## Semantic Updates: your judgment, not the runner's

The runner never touches Objective tracking, and the child is not instructed to update it. After a checkpoint, judge whether the step had **material Objective impact** — meaningful progress, decisions, risks, blockers, assumption changes, plan changes, or completion evidence. If so, record it through the `objective-update` skill and commit that update yourself. Routine step summaries are not Objective updates; most committed steps need none.

## Hard boundaries

The runner will never, in any mode:

- push, submit, publish, or merge anything — no PR ever leaves your machine from a runner step;
- update Objective tracking or write Semantic Updates;
- commit on trunk, amend, or accept a commit the child made itself (a child that committed on its own fails verification);
- run more than one slice, retry on its own, or carry state between steps.

If you need any of those, do them yourself as the parent, through the normal workflows.
