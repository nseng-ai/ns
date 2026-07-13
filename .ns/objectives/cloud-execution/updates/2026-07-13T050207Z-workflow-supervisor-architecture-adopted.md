# Workflow-supervisor architecture adopted; in-sandbox harness runners replace the AI SDK adapters

## Summary

The execution architecture is revised (user decision, 2026-07-13): the
objective's "two legs" framing — Vercel Sandbox for remote execution,
Vercel Workflows only for scheduled jobs — collapses into **one execution
spine**. Every unit of cloud work, interactive or scheduled, is a **Vercel
Workflow run acting as a durable supervisor** over a Vercel Sandbox that
holds the repo checkout and runs the configured harness as a long-lived
in-sandbox process.

The forcing fact: the settled design left the harness driver process with
no host. The AI SDK `HarnessAgent` split is driver + sandbox, and the pi
adapter runs the model loop **in the driver's own Node process**, using the
sandbox only as a remote filesystem ("Pi runs in the host Node.js process
and uses the sandbox as a remote filesystem + shell" —
`@ai-sdk/harness-pi` README; verified in source 2026-07-13). The
credentials design's v1 "in-sandbox wrapper executes the agent and
self-lands" was therefore never implementable for the pi-first steel
thread, and the local CLI cannot host the loop either (fire-and-forget is
the product contract). Vercel Workflows is the durable host.

Decisions recorded:

1. **One spine, two triggers.** A dispatch workflow run mints credentials,
   creates the sandbox, launches the harness, supervises through short poll
   steps and zero-compute `sleep()`s, lands results through git, and posts
   failure state on the anchor PR. `ns dispatch` triggers it from a
   session; cron triggers the identical workflow on a schedule. "Jobs
   invoke the same dispatch core" becomes literal.
2. **Harness hosting: in-sandbox runners; the AI SDK adapter stance is
   reversed.** This supersedes the consolidation update's "Harness stance"
   decision (`HarnessAgent` adapters on a thin chassis). Harnesses run
   headless **inside the sandbox**: pi first through a thin ns-owned runner
   over the pi library API (`@earendil-works/pi-coding-agent`, the same
   programmatic surface `@ai-sdk/harness-pi` proves is embeddable and
   headless), Claude Code second through its headless CLI. Harness choice
   is repo configuration selecting a provisioning recipe and an invocation
   command — no adapter layer. ns skills need no injection step: the
   checkout carries them.
3. **Rejected: driver-in-workflow (`@ai-sdk/workflow-harness`).** The
   official sliced-driver pattern (≤750s steps, suspend/reattach to a
   persistent sandbox) was evaluated against source and rejected for ns,
   with a named revisit trigger:
   - Dispatch is strictly non-interactive; the adapter stack's strengths
     (structured live streams, tool-approval hooks, UI attach) serve
     products with a live watcher, which dispatch by contract has none of.
   - Compute: sliced driving keeps a Fluid function alive for the whole
     run alongside the sandbox; the supervisor sleeps at zero compute
     between polls (~2× cost difference on long runs).
   - pi under slicing pays rerun-from-journal continuation plus an aborted
     in-flight model call per ~750s boundary, fixable only upstream (pi is
     third-party software).
   - The supervisor keeps the only non-serializable thing — the live model
     stream — inside the only durable compute, the sandbox; durability is
     structural rather than amortized.
   - Smaller experimental surface: drops `@ai-sdk/harness*` (explicitly
     experimental) entirely; and pi-in-a-function sees the repo through a
     VFS/path-mirroring layer, a standing source of drift from local pi
     behavior.
     **Revisit trigger:** mid-run interactivity (durable HITL, Eve channels)
     becoming a requirement. Bridge-style attachment composes *on top of*
     the supervisor (for bridge harnesses the AI SDK itself runs the harness
     in-sandbox), so adopting it later refines, not reverses, this
     architecture.
4. **Rejected: workflow-only execution (no sandbox).** A step's function
   ceiling (~800s on the current plan) caps a direct in-step harness run
   at ~13 minutes and runs the agent in the deployable's own process/env —
   disqualifying for even a demo (user decision, 2026-07-13).
5. **Credentials consequences — the supervisor is v1.** The
   credentials-design §4 "Vercel-side supervisor" upgrade is promoted to
   the v1 architecture. Both recorded v1 shortcuts are retired **before
   implementation**: the self-landing sandbox and the shared sandbox mint
   secret are removed from the design. The workflow mints installation
   tokens in-process (reusing the mint core, no HTTP hop) and injects the
   landing token into the single landing command — no push-capable
   credential ever sits in the sandbox environment. The per-run landing
   voucher upgrade is retired as unnecessary (no sandbox-initiated minting
   exists to authenticate). The deployed
   `NS_DISPATCH_SANDBOX_MINT_SECRET` production variable is now
   purposeless; removal is scheduled once the workflow spine lands. The
   hard-crash gap (sandbox dies, anchor PR silent) closes by construction:
   the supervisor outlives the sandbox.
6. **Trigger and run handle.** The local CLI triggers a run through an
   authenticated route on the deployable (Development OIDC on the
   dispatch-owned header, reusing the verified mint-route trust machinery)
   that calls the Workflow SDK's `start()`. The run handle stamped on the
   anchor PR is the **workflow run id**; the jobs TUI reads run state and
   logs from `getRun(runId)`. Sandbox ids are internal to the run.

Grounding (source-verified 2026-07-13 against local clones of
`vercel/workflow` v5.0.0-beta.31 and `vercel/ai` harness packages v1.0.22):
workflow bodies are deterministic replay sandboxes (all side effects in
steps); steps are at-least-once with silent retry on kill; a step's
ceiling is the function `maxDuration` (~800s Pro Fluid); `sleep()` suspends
at zero compute with effectively unbounded wall-clock; `@vercel/sandbox`
operations are workflow-integrated implicit steps; sandboxes persist
between step invocations with a 5-hour cap and snapshot-based rotation;
runs are pinned to their starting deployment; `getRun(runId)` exposes
status and a replayable event stream. The workflow SDK's sandbox cookbook
documents exactly this supervisor shape (one sandbox per run, detached
work, hook/sleep supervision, git history intact).

## Objective Impact

- `objective.md`, `orientation.md`, and `roadmap.md` are rewritten around
  the spine; completed roadmap rows stand as history.
- `references/seam-design.md` gains §9 (execution architecture) and
  amended gateway vocabulary; package identity, anchor-PR contract,
  `dispatch/` prefix, kernel command shapes, and `ns.toml` `[dispatch]`
  configuration all stand unchanged.
- `references/credentials-design.md` §4/§5 are revised in place: the
  supervisor is v1; the shared-secret and voucher paths are retired.
  §§1–3 and 6–7 (App tokens, late-mint phasing, local anchor credentials,
  org App, model keys, preflight) stand unchanged.
- `references/README-draft.md` "Under the hood", "Scheduled cloud work",
  and Setup credential language are updated; the user-facing experience
  contract (quick start, anchor PR, decision log, TUI) is unchanged.
- The orientation Avoid line "no agent logic in the workflow/job layer" is
  re-scoped: workflow **steps** are supervision/orchestration only; the
  agent loop runs inside the sandbox.
- New risks recorded: Workflow SDK beta churn and single-region Vercel
  World (iad1); Queues availability as a setup precondition; at-least-once
  step semantics requiring idempotent landing; the 5-hour sandbox cap; pi
  pre-1.0 library churn under the ns-owned runner; the workflow build path
  extending the deployable-packaging gate.

## Follow-Ups

- The workflow-spine probes roadmap row de-risks packaging, triggering,
  and >13-minute supervision before the steel thread.
- Remove `NS_DISPATCH_SANDBOX_MINT_SECRET` from the Vercel project once
  the spine lands (tracked on the credentials row).
- If `@earendil-works/pi-coding-agent`'s library API churn stalls the pi
  runner, fall back to the Claude Code headless CLI for the steel thread
  and record the swap (mirrors the prior adapter fallback).
- The setup-skill row additionally collects workflow deployment, Queues
  availability, and trigger-route facts as they are proven.
