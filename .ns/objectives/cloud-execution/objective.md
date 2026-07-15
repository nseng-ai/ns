---
edges:
  - objective: harness-session-generation
    annotation: Boundary agreement — cloud-execution drives harnesses in remote sandboxes only behind its own cloud backend seam (workflow-supervised in-sandbox harness runners) and must not push sandbox or vendor coupling into that objective's local harness-session contract.
  - objective: cloud-dispatch-thermo-followups
    annotation: Code-quality follow-ups from the thermo-nuclear review of this objective's dispatch stack are tracked there, not on this roadmap; its probe-retirement slice waits on this objective's steel-thread controlled Pi rerun, and hello-probe's retirement is decided together with this roadmap's setup-skill row.
---

# Cloud Execution

## Thesis

ns becomes cloud-native through one **Vercel-native** capability package —
`@nseng-ai/vercel` — with git as the state plane, on one execution spine
(workflow-supervisor architecture, adopted 2026-07-13):

Every unit of cloud work — an interactive dispatch or a scheduled job — is
a **Vercel Workflow run** acting as a durable supervisor over a **Vercel
Sandbox** that holds a real repo checkout. The configured harness runs as a
long-lived process *inside* the sandbox — pi first through a thin ns-owned
runner over the pi library API, Claude Code second through its headless
CLI — with ns skills present because the checkout carries them. The
workflow mints credentials, creates the sandbox, launches the harness,
supervises through short poll steps and zero-compute sleeps, lands results
through git — pushed branch, open PR — and posts failure state on the
anchor PR. The supervisor outlives the sandbox, so a hard crash can never
leave the anchor PR silent.

Two triggers, one spine: `ns dispatch` starts a workflow run from a
session; cron starts the identical workflow on a schedule. The job layer
schedules and supervises — workflow steps are orchestration only; the
agent loop never runs in workflow steps.

This supersedes the earlier "two legs" framing (Sandbox for remote
execution, Workflows only for scheduled jobs) and the AI SDK
`HarnessAgent` adapter stance: the harness driver process needed a durable
host, and sandboxes alone provided none. Decision trail and rejected
alternatives (driver-in-workflow slicing, workflow-only execution) are in
the workflow-supervisor-architecture-adopted Semantic Update; contracts in
`references/seam-design.md` §9.

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
under a workflow-supervised sandbox and lands git-natively, and a nightly
objective-advancement job triggers the same dispatch workflow on Vercel
cron.

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
  Vercel deployable: the dispatch workflow, its authenticated trigger
  route, the mint core, and the cron entrypoints.
- **The execution spine**: the dispatch workflow — in-process credential
  minting, sandbox creation over the repo checkout, in-sandbox harness
  provisioning and detached launch, poll/sleep supervision, git landing,
  anchor-PR reporting — behind package-internal gateways in Vercel
  vocabulary (faked for tests; no backend-agnostic executor contract — see
  `references/seam-design.md`). Harnesses run headless inside the sandbox:
  the ns-owned pi runner first, the Claude Code headless CLI second;
  harness choice is repo configuration (a provisioning recipe plus an
  invocation command), not code shape.
- **The dispatch jobs status surface**: a TUI showing the status of all
  outstanding dispatch jobs (grill decision, 2026-07-12). It enumerates the
  `dispatch/` anchor PRs and follows each PR's stamped workflow run id into
  Vercel's run observability (`getRun`) for state and logs; the anchor PR
  is the durable status trace.
- **The credentials slice**: the minimal credentials model for remote
  execution — repo access, push scope, model keys — designed before the
  executor runs real work. Design settled 2026-07-12
  (`references/credentials-design.md`), revised 2026-07-13: per-run
  repo-scoped GitHub App installation tokens (org-owned `ns-dispatch` app,
  key in a Vercel sensitive env var), late-mint at push time, local anchor
  setup on the user's own credentials, and the dispatch workflow as the
  minting supervisor — tokens are minted in-process and the landing token
  is injected into the single landing command, so no push-capable
  credential ever sits in the sandbox environment.
- **The reusable setup skill and its source material**: collect the actual
  Vercel Sandbox, Workflows, GitHub App, project-linkage, environment, and
  preflight steps as the credentials, spine-probe, and steel-thread slices
  land, then distill the proven path into a reusable skill for setting up
  workflow-supervised dispatch with git-native GitHub landing. The
  canonical README's Setup section stays the user-facing source of truth;
  the skill must not preserve secret values or turn prototype shortcuts
  into unqualified long-term guidance.
- **The durable-jobs trigger and its first job**: Vercel cron starting the
  same dispatch workflow; nightly objective advancement as the proving job,
  including the policy decision of what "advance an objective autonomously
  overnight" means and its guardrails.
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
- **Driver-in-workflow harness hosting.** The AI SDK
  `HarnessAgent`/`@ai-sdk/workflow-harness` sliced-driver pattern is the
  recorded alternative, not the architecture (decision 2026-07-13).
  Revisit only if mid-run interactivity — durable HITL, Eve channels —
  becomes a requirement; bridge-style attachment composes on top of the
  supervisor without reversing it.
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
- A real plan dispatched with `ns dispatch plan` executes end-to-end under
  a workflow-supervised Vercel Sandbox running the in-sandbox pi runner
  and lands results git-natively: pushed branch and open PR the
  dispatching side can pick up (result contract per the canonical README).
  At least one verified run's wall-clock exceeds a single Vercel Function
  invocation ceiling, proving supervision — not slicing — carries long
  runs.
- A reusable setup skill, grounded in the setup evidence collected while
  building the spine probes and steel thread, guides a fresh repository
  through the required Vercel project, workflow deployment, GitHub App,
  repo configuration, and credential/preflight setup without exposing
  secret values; following it reaches a controlled workflow-supervised
  dispatch probe against the configured GitHub repository.
- A nightly objective-advancement job triggers the same dispatch workflow
  via Vercel cron and lands its results git-natively.
- The settled contracts (package identity, gateway vocabulary, execution
  architecture, anchor/run handle, command shapes, repo configuration) are
  recorded in `references/seam-design.md` with rationale against
  alternatives.
- Decisions (stance, architecture, harness, credentials, advancement
  policy) recorded as Semantic Updates with rationale against alternatives.
- Evidence: targeted `just ts-check` / `just ts-test` pass for changed
  areas; CLI scenario tests cover the new commands' operations, help, and
  version.

## Definition of Progress

Progress is keepable when:

- Targeted `just ts-check` / `just ts-test` pass for the changed area, with
  external boundaries behind fake-driven gateways (per the standing
  test-performance boundaries).
- When the slice touches the deployable, the local `build:deployable` gate
  passes — the gate runs inside the step's validation, not in a later live
  interlude, so the known escape-local-validation risk class is caught at
  the cheapest point.
- README/reference edits state what the code *implements*; anything
  live-unproven is marked as pending verification, never asserted as
  working.

Do not keep changes that:

- Claim a live behavior was verified (in the README, code comments, or the
  step report narrative). Verification claims are interlude output, written
  and committed by the parent that witnessed them.
- Contain secret values, `.env.local` content, or credential material in
  any form.
- Advance deferred or parked rows speculatively (the setup skill before the
  steel thread; env-var/App cleanup; cmux; Eve).

Useful evidence includes: gate output for changed packages, scenario-test
coverage for new CLI surface, and the `build:deployable` result when
applicable.

## Runner Policy

This Objective is execution-friendly for the `objective-autorun` /
`objective-runner-step` loop under the boundaries below (decisions
2026-07-13, autorun-execution-policy Semantic Update). Runner steps write
and locally verify code; everything live happens between steps.

- **Runner steps are code-and-docs only.** A step may edit package code,
  tests, and README/reference prose, validated per the Definition of
  Progress. A step must stop (not improvise) when its slice appears to
  require a deployment, a billable action, a workflow trigger, credential
  material, an env-var or GitHub App change, or any external write.
- **Parent interludes are the live half.** Between steps, the parent is
  pre-authorized — without per-action prompting — for: read-only
  observability (`getRun`, deployment status, GitHub reads); `vercel
  deploy` of the package to the linked `ns-dispatch` project; triggering
  workflow runs through the authenticated trigger route; and direct
  Sandbox creation, including billable runs (the field guide's
  billable-consent requirement is deliberately waived for this prototype
  context, user decision 2026-07-13).
- **One per-action consent gate:** pushing `dispatch/` branches or
  creating/mutating PRs on `nseng-ai/ns` gets an explicit one-line
  confirmation at the moment, every time.
- **Deferred entirely from the e2e prototype** (the loop neither performs
  these nor stops for them): Vercel environment-variable mutations
  (including the retired `NS_DISPATCH_SANDBOX_MINT_SECRET` removal) and
  GitHub App permission changes.
- **Secrets:** the parent may use credentials operationally (e.g.
  `vercel env pull`, reading the Development token for trigger calls)
  under standing rules — never echo a value into output, never persist one
  outside the proven gitignored `.env.local` location, never pass one on
  argv, never record one in a commit, README, guidance file, or Semantic
  Update. Subagent steps never touch credential material.
- **Fact-folding:** the parent hand-commits proven-fact README/reference
  folds and Semantic Updates between steps; verification claims are
  written only by the actor that witnessed them. Interlude facts travel
  into later steps as `--guidance`.
- **What will not happen unless explicitly requested:** stack submission.
  Push/submit of the produced branches is post-run parent work through the
  normal Graphite/flow path (working habit: land stack segments at
  proven-phase boundaries; deploys run from the local stack, so submission
  never gates verification).

Row-level `Policy:` notes on roadmap rows mark each row's local/live seam
and override these defaults for that row.

## Assumptions and Risks

Assumptions:

- ns state travels via git: a cloud executor with a repo checkout inherits
  objectives, branch context, and branch memory with no state-sync layer.
- Harnesses can run headless inside a Vercel Sandbox: Claude Code ships a
  headless CLI mode, and pi is embeddable as a Node library — proven by
  `@ai-sdk/harness-pi`, which drives `@earendil-works/pi-coding-agent`
  programmatically and headless (verified in source 2026-07-13). The
  checkout carries the repo's skills, so in-sandbox sessions inherit them
  with no injection layer.
- Sandbox processes keep executing between workflow step invocations; a
  sandbox lives up to 5 hours; `@vercel/sandbox` operations are
  workflow-integrated implicit steps; `sleep()` suspends a workflow at
  zero compute (verified in workflow SDK source and its sandbox cookbook,
  2026-07-13).
- Eve remains a separate Vercel surface (beta, on the same Workflow SDK
  line), which supports treating Eve as a seam consumer rather than the
  chassis.
- The durable registration substrate is the typed
  `exports["./ns-extension"]` descriptor module; the flow capability proved
  the repo-local `ns`-command pattern at scale.

Risks:

- **Experimental churn**: the Workflow SDK is a v5 beta line with dense
  release cadence, Queues-based invocation, and single-region Vercel World
  (iad1); `@vercel/sandbox` is 2.x; and the ns-owned pi runner rides
  `@earendil-works/pi-coding-agent`'s pre-1.0 library API — third-party
  software ns does not control. Mitigation: the blast radius is one
  package — churn is absorbed in `@nseng-ai/vercel`'s gateway adapters and
  the pi runner, and the command core types against the gateway
  interfaces, not the SDKs. If the pi library API stalls the runner, the
  Claude Code headless CLI is the steel-thread fallback with pi following.
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
  carries the eight current production variables, the inert legacy
  `NS_DISPATCH_SANDBOX_MINT_SECRET`, and the Development repository input.
  A newly generated App key authenticated as `nseng-ai/ns-dispatch`; its
  installation token reached private repo `nseng-ai/ns` with `contents: read`.
  Development OIDC claims matched the configured team, project, and environment.
  The first production deployment exposed a missing-module artifact and a tolerated
  TypeScript diagnostic. The repair made the capability package itself the Vercel project
  root, rewrites emitted relative imports to `.js`, and gates local deployment builds on
  both TypeScript diagnostics and a closed relative-import graph. The deployed mint route
  now accepts the local Development token on a dispatch-owned header (Vercel replaces its
  reserved workload-identity header), mints a clone-only token, and completed one billable
  private-repository Sandbox probe at an exact remote SHA with verified marker/HEAD and
  cleanup. Post-verification cleanup removed the four old-prefix Production variables,
  revoked the superseded GitHub App key, and removed the downloaded local PEM; a subsequent
  authenticated clone-purpose mint confirmed the active replacement key. Dispatch preflight,
  the Pi-only implemented-harness registry, and exact checkout package-manager validation are
  deployed; preflight passed before the first completed prompt dispatch on 2026-07-14.
  The workflow-supervisor architecture (2026-07-13) retired the two recorded v1 security
  shortcuts from the design, and the code now matches it: the HTTP shared-secret landing path
  is gone, `POST /api/mint` is OIDC-only and clone-only, and workflow landing mints in-process
  for the single landing command. The linked project still carries the inert
  `NS_DISPATCH_SANDBOX_MINT_SECRET` production variable, but no source or runtime parser
  consumes it. Residuals: remove that deployed variable through the human-only environment
  process, and tighten the installed `ns-dispatch` App's extra
  `actions: write` / `workflows: write` permissions (accepted for the prototype) before wider
  deployment.
- **At-least-once step semantics**: workflow steps retry silently on
  crash/kill, and a step's ceiling is the function `maxDuration` (~800s on
  the current plan). The launch step must never re-bill an agent run
  (`maxRetries 0`); landing and reporting steps must be idempotent
  (force-push to the anchor branch, marker-comment overwrite); and no
  long-running work may live in a step — the agent runs in the sandbox,
  steps only poll.
- **Sandbox lifetime cap**: sandboxes cap at 5 hours. v1 caps run duration
  under it; snapshot-based rotation (workflow SDK sandbox cookbook) is the
  recorded extension for longer runs.
- **Autonomous overnight runs need guardrails**: cost, quota, and a
  review/observability path for cloud-produced work (carried from the
  retired map's open items). The nightly job must not merge or land
  anything a human hasn't reviewed (opening PRs for review is part of the
  result contract, not a violation of it).
- **Descriptor substrate settling**: the extension-descriptor-contract
  migration is in flight; build against `exports["./ns-extension"]` and its
  orientation, never legacy `.ns/extensions/*` shims.
- **Deployable packaging can escape local validation**: materialized and de-risked
  2026-07-13. The first remote build emitted a TypeScript error but still deployed, and
  the mint function omitted package sources imported from above its nested project root.
  The package is now the project root; `build:deployable` runs the native typecheck,
  rejects Vercel TypeScript diagnostics, and verifies every emitted relative module before
  deployment. A corrected production route and controlled Sandbox probe exercised the gate.
  The workflow spine reopened this risk class because `"use workflow"` /
  `"use step"` entrypoints compile through Vercel's workflow builder and
  Queues wiring. The gate extension landed 2026-07-13 (code-first autorun run)
  and caught two
  real would-be escapes during the run itself: the builder typechecks
  without `strictNullChecks` (requiring `ok === false` narrowing), and the
  Node builder cannot type-resolve the `workflow` package root (requiring
  runtime-free workflow-id metadata modules). The builder also overwrites
  the Build Output `config.json` (the gate merges it back) and emits a
  `nodejs22.x` workflow runtime against the project's nodeVersion 24.x —
  the live pass proved those consumers work. It then exposed a second packaging boundary:
  relocated API `filePathMap` entries did not produce runtime package closure. The durable
  gate now bundles every API handler as CommonJS, removes `filePathMap`, verifies configured
  handlers and the complete Workflow inventory, and promotes one relocated prebuilt artifact.
  Current contract and evidence live in `references/dispatch-deployment-contract.md` and
  `references/dispatch-live-evidence.md`. A subsequent hardening stack migrated the
  deployable to Workflow v5's unified artifacts with structured phase observability, then
  added `just dispatch-deploy-prod`: an exact-SHA detached-worktree build, one authoritative
  final-inventory verifier, transactional promotion, immutable deployment/alias identity
  checks, and a separate read-only production health probe. This substantially narrows local
  deployment ambiguity, but the new production command has not yet produced newer live
  deployment evidence and therefore does not replace the controlled steel-thread rerun.
- **Model-backed anchor naming is a pre-mutation dependency**: accepted for semantic
  durable identity. Dispatch fails before any push, PR, or Workflow when generation cannot
  produce a usable slug; `--slug/-s` is the explicit recovery and automation path. Exact
  remote-name availability is checked after source publication/revalidation and before anchor
  mutation with a bounded numeric suffix search; a concurrent create race remains possible
  and is handled by the existing non-overwriting
  anchor-push failure path.
- **README drifts from implementation**: mitigation — the README settles
  first, and each implementation slice cites the README section it makes
  true.
- **The setup skill fossilizes prototype shortcuts or leaks credential
  material**: mitigation — collect names, ordering, failure modes, and
  verification evidence as implementation lands, never secret values;
  author the skill from the proven steel thread and canonical README, and
  label remaining prototype debt (the overbroad App permissions, the
  pending mint-secret variable removal) with its required cleanup. The
  `references/dispatch-setup-and-preflight.md` is the acceptance procedure
  for developer mechanics, safe automation, billable-action consent, failure
  handling, and prototype-vs-production boundaries; its linked topic references
  own the detailed deployment, credential, runtime, anchor, Pi, and debugging
  contracts that future setup tooling must preserve.

## Open Questions

- Return-path shape: the anchor branch + PR opens up front and carries
  results, decision log, and failure states; a dispatch jobs status TUI is
  committed, and its plumbing is settled — `dispatch/`-prefixed anchor
  branches, the workflow run id stamped on the anchor PR, run state/logs
  from Vercel observability (grill decisions, 2026-07-12; run handle
  concretized 2026-07-13). Open: the TUI's command name and whether any
  push-style notification exists beyond the TUI and the anchor PR.
- Nightly advancement policy: which objectives qualify, what execution
  policy (`## Runner Policy`) an objective must declare to be advanced
  autonomously, and what the human review loop over the produced branches
  looks like.
- Harness provisioning strategy: per-run installation of the harness into
  the sandbox is v1; snapshot/template-based warm sandboxes are the
  recorded optimization. Decide when run volume makes cold-start cost
  material.
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
- ~~Where the harness driver process runs~~ — resolved (2026-07-13,
  workflow-supervisor Semantic Update): the harness runs inside the
  sandbox; the workflow supervises. Driver-in-workflow slicing is the
  recorded alternative with mid-run interactivity as its revisit trigger.
- Eve integration timing: which future use case (channels, durable HITL)
  first justifies an Eve app consuming the seams?
