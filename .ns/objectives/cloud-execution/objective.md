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
   with an open PR. First backend: **Vercel Sandbox**
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
demo bar: a real plan dispatched with `ns dispatch plan` executes remotely
on the repo-configured cloud backend and lands git-natively, and a nightly
objective-advancement job runs on Vercel Workflows through the same
executor core.

This is a README-driven-development Objective: `references/README-draft.md`
is the canonical user-facing contract for cloud dispatch — what a user runs,
sees, and reads — settled through the readme-driven-development loop before
and during implementation. Design decisions count as settled only when they
appear in (or are explicitly linked from) that README; seam contracts,
rationale, and research live in supporting records that never override it.

## Scope

- **The canonical dispatch README** (`references/README-draft.md` until
  promotion): what cloud dispatch is, every dispatch command, the anchor-PR
  result contract, setup/credentials, and scheduled cloud work — written for
  a user, with unsettled decisions visible as open questions rather than
  silently invented.
- **Dispatch capability** (from `dispatch-extension`): a new capability
  package exporting the `ns dispatch` repo-local command group via the typed
  `exports["./ns-extension"]` descriptor module — `ns dispatch plan`,
  `ns dispatch prompt`, and a session-continuation dispatch surface
  (`/ns:dispatch:session`: session context captured as a handoff plus a
  predefined continuation prompt). The execution backend is repo-configured;
  no `--target` flag for now (grill decision, 2026-07-12). Pi as a thin
  additive bridge; wrapper-skill coverage and typed parity metadata.
- **The remote-execution seam**: a backend gateway whose contract is
  *inputs: repo ref + plan/prompt + credentials; outputs: pushed branch +
  open PR*. Nothing Vercel-, Eve-, or AI-SDK-shaped in
  ns package APIs; vendor types stay inside the backend module.
- **Cloud backend implementation**: Vercel Sandbox + `HarnessAgent`, pi
  adapter first, Claude Code adapter second, ns skills injected per-session.
- **The dispatch jobs status surface**: a TUI showing the status of all
  outstanding dispatch jobs (grill decision, 2026-07-12), with run state and
  logs drawn from the backend's own observability through the seam and the
  anchor PR as the durable status trace.
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
- **Slots in the cloud.** Sandboxes are ephemeral fresh checkouts; slot
  semantics do not extend into the executor seam (grill decision,
  2026-07-12).
- **The cmux local target.** Retargeting today's Pi/ccc dispatch behind a
  dispatch backend selection is parked (see roadmap); the existing
  `/ccc:workspace:dispatch-*` flows keep working unchanged meanwhile.
- No runtime Graphite dependency in dispatch/executor runtime code beyond
  the sanctioned boundaries
  (`docs/conventions/graphite-dependency-boundary.md`).

## Completion Criteria

- The README is settled through the readme-driven-development loop (coherent
  product documentation, no silently invented commitments) and **promoted**
  to the dispatch capability package's README under `ts/packages/` (exact
  home decided with the package name in the seam-design row), with this
  Objective's reference repointed at the promoted doc. The Objective is not
  complete while the canonical contract lives only under `references/`.
- `ns dispatch plan|prompt` exist as repo-local kernel commands reachable
  from every harness, with wrapper-skill coverage and typed parity metadata,
  plus the `/ns:dispatch:session` session-continuation surface; the
  execution backend comes from repo configuration, not a flag.
- A real plan dispatched with `ns dispatch plan` executes on Vercel Sandbox
  under the pi harness adapter end-to-end and lands results git-natively:
  pushed branch and open PR the dispatching side can pick up (result
  contract per the canonical README).
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
  retired map's open items). The nightly job must not merge or land
  anything a human hasn't reviewed (opening PRs for review is part of the
  result contract, not a violation of it).
- **pi adapter maturity**: `@ai-sdk/harness-pi` is the least-exercised
  adapter; if it stalls, the Claude Code adapter is the fallback for the
  steel thread with pi following.
- **Descriptor substrate settling**: the extension-descriptor-contract
  migration is in flight; build against `exports["./ns-extension"]` and its
  orientation, never legacy `.ns/extensions/*` shims.
- **README drifts from implementation**: mitigation — the README settles
  first, and each implementation slice cites the README section it makes
  true.

## Open Questions

- Return-path shape: the anchor branch + PR opens up front and carries
  results, decision log, and failure states; a dispatch jobs status TUI is
  committed (grill decisions, 2026-07-12). Open: the TUI's command name and
  whether any push-style notification exists beyond the TUI and the anchor
  PR.
- Nightly advancement policy: which objectives qualify, what execution
  policy (`## Runner Policy`) an objective must declare to be advanced
  autonomously, and what the human review loop over the produced branches
  looks like.
- ~~Multi-repo scope~~ — resolved (grill decision, 2026-07-12): dispatch is
  repo-local, operating on the repo it runs from; no cross-repo dispatch in
  this objective's scope.
- ~~Slots in cloud sandboxes~~ — resolved (grill decision, 2026-07-12):
  slots stay a local worktree concept; sandboxes are ephemeral fresh
  checkouts, and nothing slot-shaped exists in the cloud.
- When does the GitHub Actions backend graduate from design note to build
  (PLG pull), and does the same seam serve it unchanged?
- Eve integration timing: which future use case (channels, durable HITL)
  first justifies an Eve app consuming the seams?
