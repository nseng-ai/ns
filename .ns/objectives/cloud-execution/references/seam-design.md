# Cloud Dispatch Seam and Capability Design

Settled 2026-07-12 in a grill session (decision trail in the
`vercel-native-seam-design-settled` Semantic Update). Revised 2026-07-13:
§9 records the workflow-supervisor execution architecture adopted after
the harness-hosting gap surfaced, and §2/§4/§6 carry dated amendments
(decision trail in the `workflow-supervisor-architecture-adopted` Semantic
Update). This note records the seam-design roadmap row's decisions with
rationale against alternatives. The canonical user-facing contract remains
`references/README-draft.md`; this note holds contracts and rationale and
never overrides the README.

**Governing stance: Vercel-native, deliberately.** The capability is named
after Vercel — *do not overpromise generality*. There is no
backend-pluggability seam, internal or public, and no design obligation to a
hypothetical GitHub Actions backend. This reverses the earlier "thin seams,
pluggable backends" thesis on purpose: naming the coupling is more honest
than abstracting over one implementation.

## 1. Package: `@nseng-ai/vercel` at `ts/packages/capabilities/vercel`

One package, three residents (recast 2026-07-13 by the workflow-supervisor
architecture, §9): the `ns dispatch` command group, the dispatch workflow
(the supervisor that owns sandbox execution), and the cron trigger for
scheduled jobs. Everything in it is Vercel-coupled, and the name says so.

Structural precedent is `ts/packages/capabilities/flow`: typed
`exports["./ns-extension"]` descriptor module, `./api`, per-command exports,
`./pi/ns-extension` bridge, wrapper-skill coverage with typed parity
metadata.

The extension **group** is `dispatch` (commands `ns dispatch …`, settings
table `[dispatch]`), so package name and command noun intentionally differ:
the package names the coupling, the command group names the user action.

Rejected:

- `@nseng-ai/dispatch` (vendor-neutral noun) — implies a generality the
  package does not have.
- `@nseng-ai/vercel-dispatch` — awkward home for the Workflows/cron jobs
  leg, which is scheduling rather than dispatch.
- Two packages (thin `dispatch` + `vercel` backend) — the
  generality-promising structure this design explicitly rejects.

## 2. Gateways speak Vercel vocabulary

The command core sits behind ordinary gateway interfaces (repo rule: pure
transformations + Gateway interfaces for external I/O; tests need fakes),
but the gateways are named in Vercel terms — `VercelSandboxGateway` /
`VercelWorkflowsGateway`-shaped — not as a backend-agnostic executor
contract. Vendor-named gateways have live precedent
(`GraphiteStackGitGateway`).

Per `docs/conventions/consumer-gateways-and-command-shape.md`, methods still
name what dispatch needs (amended 2026-07-13 for the workflow-supervisor
architecture: create a sandbox over a repo checkout with per-run injected
credentials, launch and poll a detached in-sandbox process, read result
files, clean up; start a dispatch workflow run, query run state, fetch run
logs) rather than mirroring the SDK 1:1 — in this package the domain
vocabulary legitimately includes Vercel concepts.

Rejected:

- A package-internal domain-neutral executor gateway — a pluggability
  abstraction in disguise; one implementation, speculative seam.
- A public exported backend contract — the original overpromise.

## 3. GitHub-compute pluggability: dropped entirely

The audit row, the "no vendor types in ns package APIs" completion
criterion, the orientation Avoid line, the Scope bullet, and the related
Open Question are all deleted — not parked. If PLG pull for a GitHub
Actions backend ever materializes, that work earns its own design then.

## 4. Run handle lives on the anchor PR

At submission, dispatch stamps the run identity into the anchor PR
(concretized 2026-07-13: the handle is the **dispatch workflow's run id**;
sandbox ids are internal to the run). The jobs TUI enumerates dispatch
anchor PRs, reads the handle, and queries Vercel for run state and logs
(`getRun(runId)` — status, event/log stream). Git/GitHub-native like all
ns durable state; works from any machine; no local ledger to lose.

Rejected:

- Vercel as the index (list runs, correlate to PRs) — "what's outstanding"
  would require Vercel access plus tagging discipline; correlate-by-
  convention orphans.
- Local state file — hidden non-git state; dies with the machine.

Exact stamp mechanics (PR-description metadata block vs. bot comment) are
steel-thread implementation detail.

## 5. Anchor identity: `dispatch/` branch prefix

Anchor branches are named `dispatch/<something>` (e.g.
`dispatch/<source-branch>-<short-id>`; exact scheme settled in the steel
thread). The prefix is simultaneously the user-visible naming convention
and the TUI's enumeration filter: PRs whose head branch matches `dispatch/`
are dispatch anchors.

Rejected: GitHub label (setup/permission dependency, invisible in local
git); PR-body-marker-only enumeration (scan-and-false-match).

## 6. The deployable lives inside the package

Vercel Workflows are deployed code, so the package is its own deployable:
the API/workflow/cron entrypoints and Vercel project config live directly in
`ts/packages/capabilities/vercel`, and the dispatch Vercel project roots at
that package. One home for the whole Vercel story. The original nested
`deployable/` root was retired after the first production deployment proved
that Vercel's Node function builder omitted package sources imported from
above that root; package-root deployment keeps the function boundary and its
owned sources inside one traceable project root. With the 2026-07-13
architecture the deployable is on the critical path of every dispatch —
it carries the dispatch workflow, its authenticated trigger route, and the
mint core — and the `build:deployable` gate must extend to the workflow
build path (`"use workflow"`/`"use step"` compilation through Vercel's
workflow builder and Queues wiring; owned by the workflow-hello-probe
roadmap row).

The durable-jobs contract is unchanged and now literal: cron starts the
same dispatch workflow that serves interactive dispatch; scheduled jobs
never merge or land anything without human review.

Rejected: a sibling `ts/apps/` deployable — splits the Vercel story across
two homes immediately after consolidating it into one package. Deferring
the decision — the credentials row (OIDC via `vercel link` on a project)
depends on the project existing.

## 7. Kernel commands: `plan`, `prompt`, `handoff`

- `ns dispatch plan <plan-ref>` — explicit plan reference; latest-plan
  resolution is Pi session sugar in `/ns:dispatch:plan`.
- `ns dispatch prompt <text>` — raw prompt as the unit of work.
- `ns dispatch handoff <ref>` — explicit handoff reference; dispatches with
  the predefined continuation prompt baked into the command.
  `/ns:dispatch:session` is Pi sugar: capture the session as a handoff,
  then call this. Mirrors the plan pattern (explicit ref in kernel,
  resolution as harness sugar) and makes "continue this handoff remotely"
  reachable from any harness, including for handoffs created earlier.

No `--target`, backend, harness, or model flags anywhere: you dispatch
work, not runtimes.

Rejected:

- Pure Pi composition for session continuation (no third kernel command) —
  the continuation prompt would live in Pi command prose and every wrapper
  skill would duplicate it.
- A self-capturing `ns dispatch session` — the kernel CLI has no session to
  capture; session context is harness-side by definition.

## 8. Repo configuration: `ns.toml` `[dispatch]` table

Non-secret repo-level configuration — which harness adapter runs in-sandbox
(pi first, Claude Code second), Vercel project linkage, defaults — lives in
a typed, manifest-declared settings table in repo-root `ns.toml`, rooted at
the extension group: `[dispatch]`. This is the kernel's sanctioned settings
mechanism (settings are extension-rooted TOML tables with
manifest-declared schemas — ADR 0031 / `docs/guides/points.md`), loaded by
the shared loader; no new machinery.

Secrets never appear here: model keys and executor auth stay on the Vercel
project per the settled credentials story (see README "Setup").

Rejected: `.vercel/` link + Vercel-side env as the only config (unversioned
machine state; preflight cannot report typed, versioned intent); a
dedicated `.ns/dispatch.toml` (bespoke second config surface the kernel
loader does not own).

## 9. Execution architecture: workflow supervisor + in-sandbox harness

Adopted 2026-07-13 (decision trail in the
`workflow-supervisor-architecture-adopted` Semantic Update), resolving the
harness-hosting gap the original design left implicit: the harness driver
process had no durable host — the local CLI returns immediately
(fire-and-forget), a plain Vercel Function dies at its `maxDuration`
ceiling (~800s), and the AI SDK pi adapter runs the model loop in the
driver's own Node process, so a sandbox alone cannot self-host the
pi-first steel thread.

**The architecture:** every dispatch — interactive or scheduled — is one
Vercel Workflow run acting as a durable supervisor. Its steps: mint the
clone token in-process (the mint core, no HTTP hop), create the Vercel
Sandbox over the exact dispatched SHA, provision and launch the configured
harness as a **detached long-lived process inside the sandbox**, then
supervise through short poll steps separated by zero-compute `sleep()`s.
On completion it mints the landing token in-process, injects it into the
single landing command (push, PR update), and reports on the anchor PR; on
failure it posts the failure comment; cleanup runs on every path. Workflow
steps are orchestration only — the agent loop never runs in a step, and no
step performs long-running work (steps are at-least-once and capped at the
function ceiling; the launch step is `maxRetries 0`, landing/reporting
steps are idempotent).

**Harness hosting:** harnesses run headless inside the sandbox. Pi first,
through a thin ns-owned runner over the pi library API
(`@earendil-works/pi-coding-agent` — the same programmatic, headless
surface `@ai-sdk/harness-pi` proves is embeddable; pre-1.0 churn is a
recorded risk). Claude Code second, through its headless CLI. Harness
choice is repo configuration — a provisioning recipe plus an invocation
command — and ns skills need no injection layer: the checkout carries
them. Per-run provisioning is v1; warm sandbox templates are parked.

**Trigger and observability:** the local CLI (and cron) start runs through
an authenticated route on the deployable calling the Workflow SDK's
`start()` (Development OIDC on the dispatch-owned header for the local
caller, reusing the mint route's verified trust machinery). The workflow
run id is the run handle stamped on the anchor PR (§4); `getRun(runId)`
serves run state and logs.

Grounding constraints (source-verified 2026-07-13): workflow bodies are
deterministic replay sandboxes; steps are at-least-once with silent retry;
a step's ceiling is the function `maxDuration`; `sleep()` suspends at zero
compute; sandbox processes keep executing between step invocations;
sandboxes cap at 5 hours (snapshot rotation parked); runs pin to their
starting deployment. The workflow SDK's sandbox cookbook documents this
exact supervisor shape.

Rejected:

- **Driver-in-workflow (`@ai-sdk/workflow-harness`)** — the sliced-driver
  pattern (≤750s steps reattaching to a persistent sandbox). Rejected
  because dispatch is strictly non-interactive (the adapter stack's live
  streams and approval hooks serve a watcher dispatch doesn't have); the
  sliced driver keeps a Fluid function billing for the whole run alongside
  the sandbox, where the supervisor sleeps free between polls; pi under
  slicing pays a rerun-from-journal continuation plus an aborted in-flight
  model call per slice boundary, fixable only upstream (pi is third-party
  software); and the supervisor keeps the only non-serializable thing —
  the live model stream — inside the only durable compute. **Revisit
  trigger:** mid-run interactivity (durable HITL, Eve channels). Bridge
  harnesses under the AI SDK already run in-sandbox, so bridge-style
  attachment would compose on top of this architecture, not reverse it.
- **Workflow-only execution (no sandbox)** — running the harness directly
  in a step. The function ceiling caps work at ~13 minutes and runs the
  agent in the deployable's own process and environment (beside the App
  key); disqualifying even for a demo.
- **Self-landing sandbox with a local-CLI-created sandbox** — the original
  credentials-design v1. Never implementable for pi (the loop cannot run
  in the sandbox via the adapter), left a hard-crash gap, and required a
  standing mint secret inside the agent environment. Retired before
  implementation; see the credentials-design revision notes.
