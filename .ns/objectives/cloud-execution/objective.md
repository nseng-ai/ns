---
edges:
  - objective: harness-session-generation
    annotation: Boundary agreement — cloud-execution drives harnesses in remote sandboxes only behind its own cloud backend seam (AI SDK harness adapters) and must not push sandbox or vendor coupling into that objective's local harness-session contract.
---

# Cloud Execution

## Thesis

ns becomes cloud-native through one **Vercel-native** capability package —
`@nseng-ai/vercel` — with git as the state plane. Two legs:

1. **Remote execution** — run a harness against a repo checkout in an
   isolated environment; results come back through git as a pushed branch
   with an open PR. **Vercel Sandbox**, driven via the AI SDK
   `HarnessAgent` adapters — **`@ai-sdk/harness-pi` first** (the user's
   daily-driver harness), `@ai-sdk/harness-claude-code` second — with ns
   skills injected via the Agent Skills standard.
2. **Durable jobs** — run an ns unit of work on a schedule or event.
   **Vercel Workflows** (+ cron). A job's body only invokes the same
   dispatch core; the job layer schedules and supervises, it never contains
   agent logic.

The Vercel coupling is deliberate and named (seam-design grill decision,
2026-07-12): the package is called `vercel` so it does not overpromise
generality, gateways speak Vercel vocabulary, and there is no
backend-pluggability seam. ns state travels via git — a cloud executor with
a repo checkout inherits objectives, branch context, and branch memory with
no state-sync layer — so the capability stays thin anyway; a different
compute backend, if ever wanted, earns its own design when it is real.

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
- **Dispatch capability**: `@nseng-ai/vercel` at
  `ts/packages/capabilities/vercel` (seam-design decision, 2026-07-12),
  exporting the `ns dispatch` repo-local command group via the typed
  `exports["./ns-extension"]` descriptor module — `ns dispatch plan`,
  `ns dispatch prompt`, and `ns dispatch handoff` (the kernel surface under
  `/ns:dispatch:session`: session context captured as a handoff plus a
  predefined continuation prompt). The execution backend is repo-configured
  via the `ns.toml` `[dispatch]` settings table; no `--target` flag (grill
  decisions, 2026-07-12). Pi as a thin additive bridge; wrapper-skill
  coverage and typed parity metadata. The package also carries its own
  Vercel deployable (the Workflows/cron entrypoints).
- **The executor implementation**: Vercel Sandbox + `HarnessAgent`, pi
  adapter first, Claude Code adapter second, ns skills injected
  per-session, behind package-internal gateways in Vercel vocabulary
  (faked for tests; no backend-agnostic executor contract — see
  `references/seam-design.md`).
- **The dispatch jobs status surface**: a TUI showing the status of all
  outstanding dispatch jobs (grill decision, 2026-07-12). It enumerates the
  `dispatch/` anchor PRs and follows each PR's stamped run handle into
  Vercel's own run observability for state and logs; the anchor PR is the
  durable status trace.
- **The credentials slice**: the minimal credentials model for remote
  execution — repo access, push scope, model keys — designed before the
  executor runs real work. Design settled 2026-07-12
  (`references/credentials-design.md`): per-run repo-scoped GitHub App
  installation tokens (org-owned `ns-dispatch` app, key in a Vercel
  sensitive env var), late-mint at push time, local anchor setup on the
  user's own credentials, and a v1 self-landing sandbox with a shared mint
  secret — each v1 shortcut recorded beside its named upgrade
  (Vercel-side supervisor, per-run landing voucher).
- **The reusable setup skill and its source material**: collect the actual
  Vercel Sandbox, GitHub App, project-linkage, environment, and preflight
  steps as the credentials and steel-thread slices land, then distill the
  proven path into a reusable skill for setting up Vercel Sandbox dispatch
  with git-native GitHub landing. The canonical README's Setup section stays
  the user-facing source of truth; the skill must not preserve secret values
  or turn prototype shortcuts into unqualified long-term guidance.
- **The durable-jobs seam and its first job**: Vercel Workflows + cron
  backend; nightly objective advancement as the proving job, including the
  policy decision of what "advance an objective autonomously overnight"
  means and its guardrails.
- Recording load-bearing decisions (infrastructure stance, harness choice,
  credentials model, advancement policy) as Semantic Updates.

## Non-Goals

- **Eve as chassis.** No Eve app, channel registration, or durable-session
  machinery here. Eve integration returns later as a consumer of the seams.
- **Backend pluggability.** Cloud dispatch is Vercel-native by decision
  (seam-design grill, 2026-07-12): no backend abstraction, no GitHub
  Actions design obligation, vendor vocabulary allowed in the package's
  gateways. A second compute backend, if ever wanted, earns its own design
  when it is real.
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
  to `ts/packages/capabilities/vercel/README.md`, with this Objective's
  reference repointed at the promoted doc. The Objective is not complete
  while the canonical contract lives only under `references/`.
- `ns dispatch plan|prompt|handoff` exist as repo-local kernel commands
  reachable from every harness, with wrapper-skill coverage and typed
  parity metadata, plus the `/ns:dispatch:session` session-continuation
  surface over `handoff`; the execution backend comes from the `ns.toml`
  `[dispatch]` settings table, not a flag.
- A real plan dispatched with `ns dispatch plan` executes on Vercel Sandbox
  under the pi harness adapter end-to-end and lands results git-natively:
  pushed branch and open PR the dispatching side can pick up (result
  contract per the canonical README).
- A reusable setup skill, grounded in the setup evidence collected while
  building the steel thread, guides a fresh repository through the required
  Vercel project, GitHub App, repo configuration, and credential/preflight
  setup without exposing secret values; following it reaches a controlled
  Sandbox dispatch probe against the configured GitHub repository.
- A nightly objective-advancement job runs on Vercel Workflows, invokes the
  same executor core, and lands its results git-natively.
- The settled contracts (package identity, gateway vocabulary, anchor/run
  handle, command shapes, repo configuration) are recorded in
  `references/seam-design.md` with rationale against alternatives.
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
  changes; Vercel Workflows is a beta-line SDK. Mitigation: the blast
  radius is one package — churn is absorbed in `@nseng-ai/vercel`'s gateway
  adapters, and the command core types against the gateway interfaces, not
  the SDKs.
- **Credentials may dominate cost**: repo access, push rights, and model
  keys for sandboxed execution must be designed, not assumed — hence the
  dedicated roadmap row before the steel thread. Largely de-risked
  2026-07-12: the design is settled against researched primary-source
  constraints (`references/git-credential-minting-research.md`), with
  implementation remaining. The package/deployable, typed Vercel project
  linkage, production environment-variable custody, local mint endpoint,
  and fixed private-repository Sandbox hello probe were implemented or
  verified 2026-07-12. The local endpoint contract consistently uses the
  `NS_DISPATCH_*` environment namespace, and the linked Vercel project now
  carries all nine production variables plus the Development repository input.
  A newly generated App key authenticated as `nseng-ai/ns-dispatch`; its
  installation token reached private repo `nseng-ai/ns` with `contents: read`.
  Development OIDC claims matched the configured team, project, and environment.
  Endpoint deployment, a billable Sandbox probe, and dispatch preflight remain.
  Residual, accepted deliberately (racing to an e2e prototype): the v1 shared mint
  secret and self-landing sandbox are
  security shortcuts whose upgrades (per-run landing voucher, Vercel-side
  supervisor) are recorded in `references/credentials-design.md` and must
  land before wider deployment. The installed `ns-dispatch` GitHub App also
  currently carries `actions: write` and `workflows: write` beyond the
  runtime minimum; the user accepted that overreach for the prototype, but
  the permissions must be tightened before wider deployment.
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
- **The setup skill fossilizes prototype shortcuts or leaks credential
  material**: mitigation — collect names, ordering, failure modes, and
  verification evidence as implementation lands, never secret values;
  author the skill from the proven steel thread and canonical README, and
  label the shared mint secret, self-landing sandbox, and overbroad App
  permissions with their required upgrades before wider deployment.

## Open Questions

- Return-path shape: the anchor branch + PR opens up front and carries
  results, decision log, and failure states; a dispatch jobs status TUI is
  committed, and its plumbing is settled — `dispatch/`-prefixed anchor
  branches, run handle stamped on the anchor PR, run state/logs from
  Vercel observability (grill decisions, 2026-07-12). Open: the TUI's
  command name and whether any push-style notification exists beyond the
  TUI and the anchor PR.
- Nightly advancement policy: which objectives qualify, what execution
  policy (`## Runner Policy`) an objective must declare to be advanced
  autonomously, and what the human review loop over the produced branches
  looks like.
- Setup-skill distribution and invocation: whether the reusable setup skill
  ships as a module-bundled artifact of `@nseng-ai/vercel` or through the
  repo's one-shot project-setup family, and which explicit-only invocation
  kind fits. Decide after the steel thread proves the workflow and before
  authoring the skill; do not create the skill speculatively now.
- ~~Multi-repo scope~~ — resolved (grill decision, 2026-07-12): dispatch is
  repo-local, operating on the repo it runs from; no cross-repo dispatch in
  this objective's scope.
- ~~Slots in cloud sandboxes~~ — resolved (grill decision, 2026-07-12):
  slots stay a local worktree concept; sandboxes are ephemeral fresh
  checkouts, and nothing slot-shaped exists in the cloud.
- ~~GitHub Actions backend graduation~~ — resolved by removal (seam-design
  grill, 2026-07-12): cloud dispatch is Vercel-native; no pluggability
  obligation survives, so there is nothing to graduate. A second backend
  would be a new design effort on its own merits.
- Eve integration timing: which future use case (channels, durable HITL)
  first justifies an Eve app consuming the seams?
