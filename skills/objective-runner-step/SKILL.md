---
name: objective-runner-step
disable-model-invocation: true
description: "Parent playbook for running one verified Objective implementation step via `ns objective exec runner-begin`, a harness subagent, and `ns objective exec runner-finish` (ADR 0024). Use when driving an Objective forward step by step with runner checkpoints, recovering a failed runner step with --recover, or interpreting a Runner Checkpoint. For tracking edits use objective-update; for advice on what to do next use objective-next."
---

# objective-runner-step

Run one verified implementation step of an ns Objective through a dispatched subagent, then decide what happens next. You are the **parent**: you begin the step, dispatch the subagent, finish the step, and make every between-step decision — continue, recover, update tracking, ask the human. The implementation session runs as a harness subagent you can watch live; the CLI owns only the deterministic bookends.

Part of the Objective skill family. Use the `objective` umbrella skill first for shared vocabulary, selection rules, storage model, and family policy.

## The three-phase step (ADR 0024)

One step = begin → dispatch → finish. Use the harness scratchpad for the two artifacts (report-path constraints live in the `--report-path` flag entry below).

1. **Begin** — fast, read-only, LBYL:

   ```bash
   ns objective exec runner-begin <slug> [--recover] [--guidance <text|@file>] \
     --report-path <scratch>/step-<n>-report.json --format json > <scratch>/step-<n>-facts.json
   ```

   On exit 0 the facts file holds the machine envelope: `data.prompt` (the subagent prompt), `data.baseBranch`, `data.headAtDispatch`, `data.reportPath`. Non-zero means nothing was dispatched: exit 1 is a precondition refusal (read the message), exit 2 a usage error (bad slug, report path inside the repo or already existing, unreadable `@file` guidance).

2. **Dispatch a subagent** in this same worktree with `data.prompt` **verbatim** — no additions; guidance already went through begin. The subagent owns exactly one implementation branch for exactly one slice, leaves every change uncommitted, writes its JSON report to the report path, and returns a short summary. Treat that summary as chatter: the report file is the contract. **While it runs, do not touch the worktree — no edits, no commits, no branch switches.** The `head-unchanged` gate check fails the step loudly if anything moved.

3. **Finish** — the deterministic verdict and local commit handoff, run by you, exactly once:

   ```bash
   ns objective exec runner-finish <slug> --facts @<scratch>/step-<n>-facts.json
   ```

   The report path defaults from the facts (`--report @path` overrides). Finish validates the report fail-closed, runs the verification gate, creates the runner-owned **local-only** commit with provenance trailers (`Objective-Runner-Step: <slug>`, plus `Objective-Runner-Mode: recover` for recovered attempts), and prints the **Runner Checkpoint** to stdout. That checkpoint is the handoff from runner to parent: the parent judges the commit and any later Objective update, push, submit, PR, or human handoff decision. **Finish is terminal**: never re-run it after `committed` — a second run deterministically fails verification (`head-unchanged`, `worktree-dirty`) by design.

Flags on begin:

- `<slug>` — the Objective slug (required positional on both commands).
- `--recover` — repair the dirty tree a failed step left behind instead of starting a fresh slice. Mode travels in the facts; finish has no recover flag.
- `--guidance <value>` — parent judgment woven into the subagent prompt. A value starting with `@` is always a file path (resolved against the current directory; unreadable file is a usage error); otherwise inline text. Valid in both modes.
- `--report-path <path>` — where the subagent must write its JSON report. Must not already exist and must resolve outside the repository worktree; every attempt, including every `--recover` attempt, needs a fresh path.

Model choice and timeout are yours at dispatch time — they are harness concerns, not CLI flags.

## Expectations before you run it

- **Run begin from the branch you want as the step's base.** The parent owns that base-branch choice and the decision to start another step. The subagent creates and owns only its implementation branch for this one step via the Branch Context/Graphite path. The runner owns verification, staging, and the local commit handoff. Stacking is emergent: the runner holds no cross-step state, so the next step simply begins from the branch the previous step's commit left you on.
- **Preconditions are checked up front (LBYL).** A refusal exits 1 with a message only — nothing dispatched; the runner-begin exit table owns the refusal causes.
- **The facts file is the step's identity.** Save begin's stdout verbatim and replay it to finish untouched. Finish cross-checks the slug and takes mode, base branch, and dispatch-time HEAD from it.

## Reading the Runner Checkpoint

The checkpoint has two labeled zones with different trust levels:

- **`## Verified facts (runner-attested)`** — trust these. Every line (mode, status, branch, commit, changed paths, gate checks, diagnostics) is something the runner itself observed or performed.
- **`## Child-reported narrative (unverified claims)`** — the subagent's own report (Summary, Objective Impact, Risks/Blockers, Follow-Ups, Validation), verbatim. Treat it as claims, not facts. The Validation section describes what the subagent says it ran; nothing there is runner-attested.

The checkpoint title carries the typed status: `committed`, `stop`, `blocked`, `verification-failed`, or `malfunction`. On `verification-failed`, the verified zone lists each gate check as passed/failed/skipped (branch invariants, Graphite tracking, dirty worktree, `git diff --check`, HEAD unchanged) — read those results, not the narrative, to understand what went wrong. `stop`/`blocked` checkpoints include the live changed paths, so a stopping subagent that left droppings is visible.

## Exit codes

**runner-begin**

| Exit | Meaning                                                                                                                         |
| ---- | ------------------------------------------------------------------------------------------------------------------------------- |
| 0    | Facts + prompt emitted; nothing dispatched yet                                                                                  |
| 1    | Precondition refusal (dirty tree in default mode; clean tree or trunk in `--recover`; closed Objective; detached HEAD)          |
| 2    | Usage error (invalid/unknown slug, missing/existing/in-repo report path, unreadable `@file` guidance) or infrastructure failure |

**runner-finish**

| Exit | Meaning                                                                                                                                                   | stdout                                            |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| 0    | `committed` (step verified and committed) or `stop` (subagent deliberately stopped; see the child-reported reason)                                        | checkpoint                                        |
| 1    | `blocked` (subagent reported it cannot proceed) or `verification-failed` (gate checks failed)                                                             | checkpoint                                        |
| 2    | Usage error (missing/malformed facts, slug mismatch, non-ok saved envelope — nothing judged) or malfunction (missing/invalid report file, commit failure) | malfunction checkpoint when one could be produced |

## Post-checkpoint playbook

After every finish, read the checkpoint and make an explicit decision. Finishing the step never publishes it; any conditionally authorized publication is a later parent-only action after the decisions and tracking judgment below.

- **`committed`** — review the verified facts (branch, commit, changed paths) and the claimed narrative. If the work should continue, begin the next step from the branch the step produced. Apply the Semantic Update judgment below first.
- **`verification-failed` or `blocked`** — the worktree is left exactly as the subagent left it. Choose one:
  1. **Re-dispatch with `--recover`** (the biased default): run begin again with `--recover`, sharpened `--guidance` naming the failed gate checks and what must change, and a **new report path**; then dispatch and finish again. Recovery repairs on the same non-trunk branch; judgment stays with you, token burn in the subagent.
  2. **Hand-fix**: make the remaining changes yourself and commit them yourself (the runner will not commit a step it did not verify).
  3. **Reset**: discard the attempt (e.g. `git checkout -- .` / delete the branch) and begin a fresh default-mode step with better guidance.
  4. **Escalate**: stop and ask the human when the failure signals a design problem, repeated identical failures, or anything outside the Objective's stated scope.
- **`stop`** — the subagent concluded the step should not proceed (see the child-reported reason and the live changed paths). Decide whether to re-scope, re-run with guidance, or consult the human.
- **`malfunction`** — contract failure, not a work outcome: the report file is missing or invalid, or the commit failed. Read the diagnostics; check the worktree state before doing anything else. Repeated malfunctions are a reason to escalate, not retry blindly.

One slice per step, one attempt per dispatch. There are no loops inside the runner; iteration is you re-running begin with better guidance.

## Semantic Updates: your judgment, not the runner's

The runner never touches Objective tracking, and the subagent is not instructed to update it. After a checkpoint, judge whether the step had **material Objective impact** — meaningful progress, decisions, risks, blockers, assumption changes, plan changes, or completion evidence. If so, record it through the `objective-update` skill and commit that update yourself, **between steps only**. Routine step summaries are not Objective updates; most committed steps need none.

## Conditional parent-only publication

ADR 0037 does not change this step's authority. The implementation child and every action from `runner-begin` through `runner-finish` remain local-only. The child receives no publication attestation, bound target, summary artifact, scratch path, or credential; `runner-finish` owns only the verified local commit and Runner Checkpoint.

A trusted parent may publish afterward only when the selected Objective's durable Runner Policy permits it, a human confirms an exact launch preview, and the implemented parent publisher binds that one invocation to the Objective slug, current non-trunk branch, already-existing PR, and launch/last-published heads. Before publication, the parent must read the committed checkpoint, complete its continue/recover/stop and Semantic Update judgments, commit any material Objective tracking, and supply the cumulative PR-ready summary. If the parent publication capability is unavailable, the run remains local-only; never substitute raw `git push`, `gt submit`, or `gh` mutation.

## Hard boundaries

Canonical child/Runner-step forbidden-action wording: "Do not push, submit, publish, merge, land, create or update pull requests, or perform any other write-capable external action — no `git push`, `gt submit`, `gh pr create`, `ns flow submit`, or PR mutation may be run by the implementation child or from inside an Objective Runner step. The child has no publication authority; `runner-finish` owns only the verified local commit. Any authorized publication is a distinct parent-only action after the Runner Checkpoint, parent judgment, and completion of any material Objective tracking."

The runner will never, in any mode:

- update Objective tracking or write Semantic Updates;
- commit on trunk, amend, or accept a commit the subagent made itself (a subagent that committed on its own fails verification);
- run more than one slice, retry on its own, or carry state between steps.

And you, the parent, never mutate the worktree between begin and finish — the gate makes violations loud, not silent.
