---
edges:
  - objective: harness-session-generation
    annotation: Boundary agreement — cloud-execution drives harnesses in remote sandboxes only behind its own cloud backend seam (AI SDK harness adapters) and must not push sandbox or vendor coupling into that objective's local harness-session contract.
---

# Cloud Execution

## Thesis

ns becomes cloud-native through two thin seams built on Vercel primitives,
with git as the state plane and backends kept pluggable:

1. **Remote execution** — run a harness against a repo checkout in an
   isolated environment; results come back through git as a pushed branch
   plus a handoff/branch-memory record. First backend: **Vercel Sandbox**
   driven via the AI SDK `HarnessAgent` adapters — **`@ai-sdk/harness-pi`
   first** (the user's daily-driver harness), `@ai-sdk/harness-claude-code`
   second — with ns skills injected via the Agent Skills standard.
2. **Durable jobs** — run an ns unit of work on a schedule or event. First
   backend: **Vercel Workflows** (+ cron). A job's body only invokes seam 1;
   the job layer schedules and supervises, it never contains agent logic.

Because ns state travels via git — a cloud executor with a repo checkout
inherits objectives, branch context, and branch memory with no state-sync
layer — both seams stay thin, and a second compute backend (GitHub Actions,
for PLG reach) stays cheap: designed for here, not built.

**Eve is a consumer of these seams, not the foundation.** This reverses the
retired wayfinding map's "Eve is presumed in as the cloud chassis" stance
(see the initial Semantic Update). Eve earns its place later, if and when
channels or durable HITL sessions are wanted, by calling the same seams from
its trusted runtime.

This objective is the single consolidated cloud workstream: it subsumes the
`dispatch-extension` Objective (closed by subsumption) and absorbs and
retires the `docs/wayfinding/ns-cloud-capabilities/` wayfinding map. The
demo bar: a real plan dispatched with `ns dispatch --target cloud` executes
remotely and lands git-natively, and a nightly objective-advancement job
runs on Vercel Workflows through the same executor core.

## Scope

- **Dispatch capability** (from `dispatch-extension`): a new capability
  package exporting the `ns dispatch` repo-local command group via the typed
  `exports["./ns-extension"]` descriptor module, with `ns dispatch plan` and
  `ns dispatch prompt` honoring `--target`; Pi as a thin additive bridge;
  wrapper-skill coverage and typed parity metadata.
- **The remote-execution seam**: a backend gateway whose contract is
  *inputs: repo ref + plan/prompt + credentials; outputs: pushed branch +
  handoff/branch-memory record*. Nothing Vercel-, Eve-, or AI-SDK-shaped in
  ns package APIs; vendor types stay inside the backend module.
- **Cloud backend implementation**: Vercel Sandbox + `HarnessAgent`, pi
  adapter first, Claude Code adapter second, ns skills injected per-session.
- **The credentials slice**: the minimal credentials model for remote
  execution — repo access, push scope, model keys — designed before the
  executor runs real work.
- **The durable-jobs seam and its first job**: Vercel Workflows + cron
  backend; nightly objective advancement as the proving job, including the
  policy decision of what "advance an objective autonomously overnight"
  means and its guardrails.
- **GitHub-compute pluggability as a design obligation**: keep the seam
  contracts honest so a GitHub Actions backend is a backend swap, and record
  what it would require — without building it.
- Recording load-bearing decisions (infrastructure stance, harness choice,
  credentials model, advancement policy) as Semantic Updates.

## Non-Goals

- **Eve as chassis.** No Eve app, channel registration, or durable-session
  machinery here. Eve integration returns later as a consumer of the seams.
- **Building the GitHub Actions backend.** Designed for, audited against,
  not implemented.
- **Channels and event-driven work**: Slack sessions, GitHub-webhook triage,
  and speculative execution are enabled-later use cases (ideas preserved
  from the retired wayfinding map in Parked/Open Questions), not scope.
- **The cmux local target.** Retargeting today's Pi/ccc dispatch behind
  `ns dispatch --target cmux` is parked (see roadmap); the existing
  `/ccc:workspace:dispatch-*` flows keep working unchanged meanwhile.
- No runtime Graphite dependency in dispatch/executor runtime code beyond
  the sanctioned boundaries
  (`docs/conventions/graphite-dependency-boundary.md`).

## Completion Criteria

- `ns dispatch plan|prompt --target cloud` exist as repo-local kernel
  commands reachable from every harness, with wrapper-skill coverage and
  typed parity metadata.
- A real plan dispatched with `--target cloud` executes on Vercel Sandbox
  under the pi harness adapter end-to-end and lands results git-natively:
  pushed branch plus handoff/branch-memory record the dispatching side can
  pick up.
- A nightly objective-advancement job runs on Vercel Workflows, invokes the
  same executor core, and lands its results git-natively.
- The seam contracts are documented and contain no vendor types in ns
  package APIs; the GitHub-backend design note exists.
- Decisions (stance, harness, credentials, advancement policy) recorded as
  Semantic Updates with rationale against alternatives.
- Evidence: targeted `just ts-check` / `just ts-test` pass for changed
  areas; CLI scenario tests cover the new commands' operations, help, and
  version.

## Assumptions and Risks

Assumptions:

- ns state travels via git: a cloud executor with a repo checkout inherits
  objectives, branch context, and branch memory with no state-sync layer.
- The AI SDK harness adapters (`@ai-sdk/harness-pi`,
  `@ai-sdk/harness-claude-code`) can run ns's existing harnesses in
  sandboxes with ns skills injected via the Agent Skills standard (verified
  in source 2026-07-08; APIs explicitly experimental).
- Eve and `HarnessAgent` are separate Vercel surfaces today — Eve does not
  consume `HarnessAgent` (verified 2026-07-08) — which supports treating Eve
  as a seam consumer rather than the chassis.
- The durable registration substrate is the typed
  `exports["./ns-extension"]` descriptor module; the flow capability proved
  the repo-local `ns`-command pattern at scale.

Risks:

- **Experimental churn**: the AI SDK harness packages warn of breaking
  changes; Vercel Workflows is a beta-line SDK. Mitigation: the seams stay
  thin and vendor types stay out of ns package APIs so churn is absorbed in
  the backend modules.
- **Credentials may dominate cost**: repo access, push rights, and model
  keys for sandboxed execution must be designed, not assumed — hence the
  dedicated roadmap row before the steel thread.
- **Autonomous overnight runs need guardrails**: cost, quota, and a
  review/observability path for cloud-produced work (carried from the
  retired map's open items). The nightly job must not merge or submit
  anything a human hasn't reviewed.
- **pi adapter maturity**: `@ai-sdk/harness-pi` is the least-exercised
  adapter; if it stalls, the Claude Code adapter is the fallback for the
  steel thread with pi following.
- **Descriptor substrate settling**: the extension-descriptor-contract
  migration is in flight; build against `exports["./ns-extension"]` and its
  orientation, never legacy `.ns/extensions/*` shims.

## Open Questions

- Return-path shape beyond the pushed branch + handoff: does the
  dispatching session poll, or is completion discovered purely via
  git/handoff inspection?
- Nightly advancement policy: which objectives qualify, what execution
  policy (`## Runner Policy`) an objective must declare to be advanced
  autonomously, and what the human review loop over the produced branches
  looks like.
- Multi-repo scope (carried from the retired map): is cloud execution
  scoped to the ns repo (self-hosting dogfood) or pointable at other repos,
  and where does repo-specific configuration live?
- Do slots extend to cloud sandboxes or stay a local concept (carried from
  the retired map)?
- When does the GitHub Actions backend graduate from design note to build
  (PLG pull), and does the same seam serve it unchanged?
- Eve integration timing: which future use case (channels, durable HITL)
  first justifies an Eve app consuming the seams?
