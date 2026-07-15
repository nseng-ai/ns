# ADR 0024: Objective Runner begin/finish decomposition with harness-subagent dispatch

## Status

Accepted

Refined by ADR 0037 only for explicitly authorized parent-only publication after a committed Runner Checkpoint; the decomposed step itself remains local-only.

Supersedes ADR 0022 in part: the invocation surface, the child report medium, and child-dispatch ownership. Every other ADR 0022 decision — the verification gate, runner-owned commits with provenance trailers, the two-zone Runner Checkpoint trust model, parent-initiated recovery, and parental Semantic Update judgment — stands unchanged and is restated below only where the new surface touches it.

## Context

ADR 0022 shipped one blocking command, `sdl objective exec runner-step <slug>`, that owns the entire step: preconditions, child dispatch through a `ChildSessionGateway`, report scraping from the child's final message, verification, commit, and checkpoint. Dogfooding exposed a structural problem: the CLI hosts a full agent session inside an opaque subprocess, and a large share of the runner-path code — the Pi NDJSON activity parser, timeout/SIGTERM/SIGKILL ladder, bounded stderr tails, heartbeat lines, session-file plumbing — exists solely to let the parent observe a process its own harness could observe natively. Two rounds of observability patches (per-line stderr enrichment, heartbeats plus background-tail skill guidance) improved the symptoms without touching the cause. The gateway also forced the one Pi coupling in the runner command's wiring (the composition factory and jiti barrel workaround recorded in ADR 0022's open wiring question).

Parent harnesses meanwhile provide first-class subagent dispatch: live tool-call visibility, lifecycle and interrupt handling, policy-governed model routing, and cost accounting. The CLI's differentiated value in the runner path is the deterministic bookends — LBYL preconditions, prompt construction, the verification gate, the provenance commit, checkpoint rendering — not process babysitting. This is exactly the cli-push-down boundary: meaning stays in the agent layer, mechanics move to tested commands.

## Decision

Decompose the runner step into two Pi-free hidden exec commands, with the implementation session executed as a **harness subagent** dispatched by the parent skill in the same worktree:

1. **`sdl objective exec runner-begin <slug> [--recover] [--guidance <text|@file>] --report-path <path>`** — validates the request, runs the ADR 0022 preconditions unchanged (LBYL; refusals exit 1 with nothing dispatched), builds the child prompt, and returns machine-readable **step facts**: `{ slug, mode, baseBranch, headAtDispatch, changedPaths, objectivePath, reportPath, prompt }`. `--model` and `--timeout` are gone: dispatch is no longer the CLI's business.
2. The **parent** saves the begin output verbatim as a facts file, dispatches a subagent with `prompt` verbatim, and waits. The subagent implements one slice, leaves every change uncommitted, writes its report, and ends with a short non-contractual summary.
3. **`sdl objective exec runner-finish <slug> --facts @<file> [--report @<file>]`** — validates the facts and report fail-closed, then follows the ADR 0022 terminal paths unchanged: `stop` → ok checkpoint; `blocked` → negative checkpoint; `ready-for-parent-commit` → the five-part verification gate → runner-owned commit with `Objective-Runner-Step` / `Objective-Runner-Mode: recover` trailers → committed checkpoint. Exit codes keep the 0022 taxonomy per bookend: 0 committed/stop, 1 blocked/verification-failed/refusal, 2 usage error or malfunction.

### Report medium

The child report moves from a marker-delimited block scraped out of chat text to a **JSON document the subagent writes to a begin-chosen path**. The schema mirrors the ADR 0022 report exactly — typed header (`status`, `branch`, `roadmapItems`, `commitSubject`/`commitBody`, `stopReason`) plus the five mandated narrative sections — and validation is fail-closed with all-problems diagnostics, preserving the diagnostic-rich report-integrity behavior (missing or invalid report is an exit-2 malfunction). The subagent's chat text carries no contract. This follows the repo's payload-artifact precedent: agent-produced structured files validated deterministically by a command, never parsed out of prose.

### Facts handoff and hygiene

- The facts file is a **parent-held artifact**, not hidden state: it is begin's own machine output replayed to finish. Finish accepts the saved envelope or its bare data object, cross-checks the slug, and takes `mode`, `baseBranch`, `headAtDispatch`, and `reportPath` from it. There is deliberately no `--recover` on finish — mode travels only in facts, so a mode mismatch between dispatch and verification cannot be expressed.
- Facts are **parent-trust**, the same trust level as the legacy in-process values: tampering only changes the baseline the gate measures live repository state against; it cannot make the gate attest anything the repository does not show.
- Begin refuses (usage error) a report path inside the repository worktree — the report must never appear in the gate's changed paths or be staged into the runner commit — and refuses a pre-existing report file, which makes stale-report replay structurally impossible: every attempt, including every `--recover` attempt, requires a fresh report path.

### What the decomposition removes and keeps

- Removed with the legacy surface (after dogfooding mileage, as an explicit deletion slice): `runner-step`, the `ChildSessionGateway` contract and its Pi subprocess adapter, the fake gateway, the event channel, the NDJSON activity parser, timeout machinery, heartbeats, and the marker-block report parser. The objective package's runner path retains **zero Pi coupling**, dissolving ADR 0022's host-composition wiring question.
- Usage/cost facts leave the Runner Checkpoint: the harness owns subagent cost visibility. The independent `exec-runner-subagent-usage` command remains for Pi-session JSONL analysis.
- One deliberate checkpoint improvement: `stop`/`blocked` checkpoints now include the live changed paths, so a stopping child that left droppings is visible in the verified zone.

## Why

Dispatch ownership belongs to the harness because that is where visibility, interrupts, model policy, and cost accounting already live; every line the CLI spent replicating them was undifferentiated machinery, and observability of an in-CLI child was patched twice without reaching the cause. Verification and commit belong in the CLI because they are deterministic, testable, and must stay runner-attested for the checkpoint trust model to mean anything — and they remain invoked by the **parent**, so the ADR 0022 property that the child can never commit or self-attest survives the inversion. A file-based JSON report is Zod-validated at a real boundary instead of scraped from prose, aligning the runner with the payload-artifact precedent and the push-down ban on parsing markdown.

ADR 0022 bought "stops after the commit" structurally from the blocking process exit. The decomposition trades that for a contract held by the parent skill — finish is terminal, one judgment checkpoint per step, no loop below the parent — plus one hard mechanical guarantee: only `runner-finish` produces the provenance-trailer commit, and running it again after a commit deterministically fails the gate (`head-unchanged`, `worktree-dirty`). With a parent present at every boundary, that is the same posture ADR 0022 chose when it dropped the automatic recovery supervisor.

## Consequences

- The parent must not mutate the worktree between begin and finish; the `head-unchanged` gate check makes violations loud rather than silent.
- The step contract spans three invocations, so the parent skills (`objective-runner-step`, `objective-autorun`) own the sequencing prose: same worktree, prompt verbatim, fresh report path per attempt, finish exactly once.
- Harness dispatch ownership does not grant arbitrary provider/model authority. Objective implementation children inherit the parent provider, model, and thinking policy by default; the only orchestrator-selected down-route is a named approved cheap model within the same provider, chosen before dispatch. Failure does not authorize rerouting.
- Cross-harness parity improves at the CLI layer (both bookends are plain commands with fake-driven scenario tests) while subagent dispatch is deliberately harness-specific skill prose.
- During the transition both surfaces coexist; skills reference only the decomposed flow. The legacy machinery is deleted once the new flow has real dogfooding mileage, including a `--recover` cycle.
- Recovery keeps its ADR 0022 shape on the new surface: `--recover` is a begin mode, judgment stays in the parent, one attempt per invocation.
