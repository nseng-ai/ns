# ADR 0022: Autoobjective prose pattern and Objective Runner step workflow

## Status

Accepted

## Context

Dogfooding `/objective:autopilot` showed that a deterministic multi-iteration loop can safely run child sessions, verify repository state, and commit slices, but it leaves the parent LM mostly observing a batch controller. That loses the intended parent-session judgment between Objective implementation slices: whether the last child advanced the roadmap, whether to update Objective tracking, whether to ask the human, whether to continue, and how to carry cross-session context.

At the same time, Objectives must remain durable narrative roadmap records, not workflow controllers, hidden task databases, or new machine state categories. Pi should be presentation/runtime, not the canonical home for portable workflow policy. The Objective package can own Objective-centric runner semantics only if the implementation stays gateway-injected and avoids depending on the Pi host or broad orchestration internals.

A design-grilling session against the first draft of this ADR resolved the remaining contract details recorded below; the largest revision was dropping the automatic LM recovery supervisor in favor of parent-initiated recovery.

## Decision

Adopt **Autoobjective** as a prose-only Objective pattern: an ordinary Objective whose roadmap and runner policy are intentionally shaped for repeated Objective Runner steps with parent-LM checkpoints between committed slices. Autoobjective is not a machine category, Objective status, hidden queue, or unattended batch controller.

Adopt **Objective Runner** as the portable Objective-owned workflow core for one implementation step. The Objective package owns the runner policy, internal typed facts, and parent-facing Markdown checkpoint contract behind narrow injected runner gateways. CLI/Pi edges provide concrete operations such as child dispatch, Branch Context/Graphite interaction, Git commit mechanics, and any host presentation; the Objective core must not import the Pi host.

### Invocation surface

The parent LM invokes one step through a hidden, blocking CLI command: `sdl objective exec runner-step <slug>`. The command dispatches the child, verifies, commits, prints the Runner Checkpoint to stdout, and exits — the blocking model structurally enforces "stops after the commit." A Pi command surface is additive presentation, never the canonical home (cross-harness parity).

- One command, two modes. Default mode requires a clean worktree (LBYL, refused at dispatch time). `--recover` mode inverts the precondition — it requires a dirty tree on a non-trunk branch left by a failed step — and prompts the child with the prior failure diagnostics plus parent guidance.
- `--guidance` (inline text or a file path) is valid in both modes: parent judgment expressed cheaply, executed in the child. Parent session context is precious; token-heavy work belongs in children.
- Model and timeout are CLI flags with defaults. There is no structured runner configuration file; objective-level runner policy is prose inside the existing Objective documents, and the child prompt stays thin — it points the child at the Objective and existing skills rather than inlining context.
- stdout carries the checkpoint Markdown and nothing else, for every terminal state. stderr carries live streamed progress and is never part of the contract. Exit codes follow the repo-wide clinkr convention: `0` for clean outcomes (committed, or child-reported stop), `1` for negative outcomes (blocked, or verification failed; the checkpoint's typed status distinguishes them), `2` for runner malfunction with no trustworthy checkpoint.

### Gateway boundaries

- Child dispatch goes through one generic, harness-neutral, streaming `ChildSessionGateway` owned by the Objective package (event stream plus final outcome). The core owns prompt construction and report parsing. The gateway is a required injected dependency: the Objective package contains no Pi coupling at all — not even a `pi` subprocess spawn. The real Pi-subprocess adapter lives in an already-Pi-coupled edge and is composed by host wiring, preserving option value in both child harness and process model as pure adapter swaps.
- Neutral git mutations needed by the runner (porcelain-derived status facts, staging, commit) are added to the shared `GitGateway` contract with in-memory fake parity, following the `createBranchAtHead` precedent. Runner-specific oddities such as `git diff --check` stay on the command-exec seam.
- The Graphite tracking check is performed through an injected `GraphiteBranchGateway`, per the branch-context precedent and the Graphite dependency boundary.

### Step contract

An Objective Runner step:

- runs one focused child implementation slice; the child creates its own implementation branch via the Branch Context/Graphite path (branch naming and plan attachment are semantic acts the child owns); the runner only verifies and refuses;
- requires the child to return a marker-delimited report with a typed header — status (`ready-for-parent-commit` | `stop` | `blocked`), branch, roadmap item(s), and a proposed commit message — plus mandated narrative sections mirroring the Semantic Update shape: Summary, Objective Impact (claimed), Risks/Blockers, Follow-Ups, and Validation (what the child ran, including any format/check fixes performed per prose policy);
- verifies live repository facts deterministically (see gate below);
- creates the local commit itself when verification succeeds, using the child's proposed message plus deterministic provenance trailers (`Objective-Runner-Step: <slug>`, and `Objective-Runner-Mode: recover` for recovered attempts); the child never commits;
- returns a concise Markdown **Runner Checkpoint** to the parent LM, composed of two labeled zones: runner-attested verified facts (branch, commit, changed files, gate results, usage) and the child-reported narrative explicitly marked as unverified claims;
- stops after the commit so the parent LM decides whether to continue, update Objective tracking, ask the human, or take another action;
- never submits, pushes, merges, publishes, amends, commits on trunk, or runs an unattended multi-step batch;
- holds no cross-step state: stacking is emergent — the parent invokes the next step from the branch the previous step produced.

### Verification gate

1. **Report integrity** — the marker block parses and all required header fields and sections are present; failure here is runner malfunction (exit 2), not a verification failure.
2. **Branch invariants** — current branch is not trunk; the child moved off the step's base branch (in `--recover` mode: stayed on the same non-trunk branch as the failed attempt); the current branch matches the report's claim; the branch is Graphite-tracked.
3. **Change invariants** — the worktree is dirty (a slice that changed nothing is a failed slice) and `git diff --check` passes.
4. There is **no tracking-evidence requirement**: Semantic Update judgment belongs to the parent (below), so the gate does not force Objective-file changes into the slice.
5. **HEAD unchanged** — HEAD at dispatch equals HEAD at verification in both modes; the commit is the runner's act, and a child that committed on its own fails verification.

### Recovery

There is no automatic LM recovery supervisor. The supervisor in the autopilot prototype compensated for an unattended batch loop; the checkpoint model removes that condition. On gate failure the step fails with a diagnostics-rich checkpoint and the worktree left exactly as the child left it. The parent is the recovery decision-maker, biased toward `--recover` re-dispatch (judgment in the parent, token burn in the child) but free to hand-fix, reset, or ask the human. One attempt per invocation, no loops inside the runner; iteration is parent-driven re-invocation with better guidance. Deterministic check/fix work (formatters and similar) is the child's responsibility via prose policy, reported in its Validation section — the runner carries no recovery machinery of its own.

### Semantic Updates

Semantic Updates are written only when the parent judges, from a checkpoint, that a step had material Objective impact: meaningful progress, decisions, risks, blockers, assumption changes, plan changes, or completion evidence. Routine step summaries are not Objective updates. The child is not instructed to update tracking, and the runner has no update-writing surface; the parent writes updates through the existing Objective Update workflow and commits them itself. The Tracking Gate remains advisory.

## Why

This keeps deterministic tooling as the substrate while restoring the parent LM as the semantic orchestrator. The automatic commit gives each step a reviewable unit, but the mandatory checkpoint prevents the old deterministic batch loop from becoming the workflow driver. Markdown checkpoints keep the parent-facing contract narrative and LM-friendly, while typed internal facts keep the runner testable without committing to a public JSON workflow state. The verified/claimed split in the checkpoint is load-bearing: the parent's continue/stop/update/ask decisions rest on facts the runner attested plus narrative it explicitly did not.

Dropping the automatic recovery supervisor and moving recovery to a parent-initiated mode is the same principle applied to failure: with a parent present at every step boundary, a second deliberately narrowed LM plus enforcement machinery is complexity spent replicating judgment the parent already has — while `--recover` keeps the token-heavy repair work out of the parent's context.

Placing the runner core in the Objective capability matches the user-facing domain while preserving the existing dependency boundary through injected gateways, and keeping child dispatch behind a required injected streaming gateway preserves option value over future child harnesses and process models. Recording Autoobjective as a prose pattern preserves Objective ontology: the record stays an Objective, and execution-friendliness remains prose, not a new status or hidden state machine.

## Consequences

- The existing Pi-only `/objective:autopilot` implementation is legacy/prototype behavior: frozen immediately (no feature work lands there) and deleted as an explicit final slice once `runner-step` has real dogfooding mileage.
- Durable command vocabulary distinguishes the record pattern from the action: Autoobjective names the prose pattern; Objective Runner step names the workflow action; recovery is a mode of the step, not a new term; Runner Checkpoint names the parent-facing contract.
- Batch mode is out of scope for the first durable design. If it returns later, it must be explicit lower-agency behavior, not the default path.
- An automatic LM recovery supervisor may only be reintroduced later as explicit, evidence-gated policy (dogfooding showing failure round-trips are too costly), never speculatively; the `ChildSessionGateway` seam admits it without redesign.
- Parent sessions remain responsible for deciding whether and when to write material Objective Semantic Updates after a checkpoint; no deterministic gate forces tracking into a slice.
- Runner-produced commits are mechanically identifiable by trailer, without any hidden runner state.
