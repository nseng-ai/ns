# Roadmap

Row order is dependency order: the credentials row gates the workflow-spine
probes, the probes gate the steel thread, and every row after the steel
thread widens it. The execution architecture was revised 2026-07-13
(workflow-supervisor-architecture-adopted Semantic Update): completed rows
below stand as history, and where their recorded decisions were amended the
amendments live in `references/seam-design.md` §9 and the revision notes in
`references/credentials-design.md`. Each implementation row names the
README (`references/README-draft.md`) sections it makes true — the README
is the contract, the row is the slice, and a row's outcome folds back into
the README rather than settling anywhere else. The credentials, spine-probe,
and steel-thread slices also collect the exact setup inputs, ordering,
failure modes, and safe verification evidence needed by the later
setup-skill row; they never record secret values. Implementation rows
carry `Policy:` notes (2026-07-13) marking each row's local/live seam for
the `objective-autorun` loop — what runner steps may take versus what
happens as a parent interlude — under the boundaries in `objective.md`'s
`## Runner Policy`.

## Work

- [x] Settle the canonical README (`references/README-draft.md`) through the
      readme-driven-development loop. Settled 2026-07-12 over three grill passes
      (full decision trail in the adopt-readme-driven-development Semantic
      Update): the README reads as coherent product documentation of the
      in-harness experience, Pi first, with no silently invented commitments.
      Its three remaining open questions are visible in the README and each is
      owned by a row below — TUI command name / push notification → jobs-TUI
      row; git-credential minting mechanism → credentials row; nightly
      advancement policy → durable-jobs row.
- [x] Seam and capability design — the decision row that unblocked
      implementation. Settled 2026-07-12 in a grill session; decisions with
      rationale in `references/seam-design.md` plus the
      vercel-native-seam-design-settled Semantic Update. Headline reversal:
      **Vercel-native, deliberately** — the package is `@nseng-ai/vercel`
      at `ts/packages/capabilities/vercel` (one package: commands, executor,
      jobs, and its own Vercel deployable; flow's export shape as
      precedent), gateways speak Vercel vocabulary (faked for tests; no
      backend-agnostic executor contract), and GitHub-compute pluggability
      is dropped entirely. Kernel commands are
      `ns dispatch plan|prompt|handoff`; anchor branches are
      `dispatch/`-prefixed; the run handle is stamped on the anchor PR;
      repo configuration is the typed `ns.toml` `[dispatch]` table.
      Amended 2026-07-13: the execution architecture is the workflow
      supervisor with in-sandbox harness runners (`seam-design.md` §9); the
      package, anchor, command, and configuration decisions stand.
- [x] Credentials slice — gates the workflow spine running real work. Makes
      true: "Setup". **Design settled 2026-07-12, revised 2026-07-13** (research
      note `references/git-credential-minting-research.md`, decisions in
      `references/credentials-design.md` + the credentials-design-settled and
      workflow-supervisor-architecture-adopted Semantic Updates): GitHub App
      installation tokens (per-run PAT minting is impossible — web-UI only),
      late-mint at push time (clone token / tokenless work / fresh landing
      token), local anchor setup on the user's own credentials, org-owned
      `ns-dispatch` app with its key in a sensitive env var. The 2026-07-13
      revision promoted the Vercel-side supervisor from named upgrade to the
      v1 architecture and retired the shared mint secret and self-landing
      sandbox before implementation.
      Human setup completed 2026-07-12: the org-owned `ns-dispatch` App
      (App ID `4282120`) is actively installed only on `nseng-ai/ns`
      (installation ID `146155769`). Required permissions are present; the
      user accepted its additional Actions/Workflows write access for the
      prototype, with tightening required before wider deployment.
      Package/project bootstrap completed 2026-07-12: the
      `@nseng-ai/vercel` package now carries its own deployable, the existing
      `ns-dispatch` Vercel project is linked through the typed repo-root
      `[dispatch]` table, and required production environment variables were
      verified by name and sensitivity without reading or recording values.
      The local health-only deployable build passes. Mint and controlled-probe
      implementation completed locally 2026-07-12: `POST /api/mint` enforces
      exact repository and purpose constraints behind Development Vercel OIDC
      for clone credentials, then mints narrow GitHub App installation tokens.
      A fixed private-repository Sandbox hello probe checks out an exact SHA,
      verifies a safe marker/HEAD result, and attempts cleanup; the canonical
      README records the proven local setup order and safe failure signals.
      The runtime, probe, tests, and README use one `NS_DISPATCH_*` namespace
      for the dispatch-owned environment variables. Targeted package tests and
      workspace typecheck pass. Linked-project
      configuration completed 2026-07-13: all nine `NS_DISPATCH_*` production
      variables are present with secrets kept sensitive, the repository input is
      also present in Development, and actual Development-token claims supplied the
      exact issuer/audience while matching the configured team, project, and
      environment. The new App key authenticated as `nseng-ai/ns-dispatch`, and a
      clone-purpose installation token reached private repo `nseng-ai/ns` with
      `contents: read`. Live boundary verification completed 2026-07-13. The first
      deployment exposed three independent integration facts: a nested project root omitted
      package-owned runtime sources; Vercel tolerated a TypeScript diagnostic while promoting
      the build; and its reserved `x-vercel-oidc-token` header carried the production
      Function's identity rather than the caller's Development token. The repair makes the
      capability package the Vercel project root, rewrites emitted relative imports to `.js`,
      gates `build:deployable` on native typecheck/Vercel diagnostics/artifact closure, and
      uses `x-ns-dispatch-oidc-token` for the local caller. The stable mint route now returns
      a safe unauthorized response without caller auth, accepts the verified Development
      identity, and completed one billable private-repository Sandbox probe at exact remote
      SHA `5308b3d45ba520fd530d5a288e3de4ab32914b05`; marker, HEAD, and cleanup all passed.
      The canonical setup procedure records the proven package-root build/link, repo-root
      deployment, env-pull, and probe commands. Post-verification credential cleanup completed
      2026-07-13: the four old-prefix Production variables were removed, the user confirmed
      revocation of the superseded GitHub App key and local PEM cleanup, and a safe authenticated
      clone-purpose mint passed without exposing its token. Remaining (reshaped
      by the 2026-07-13 architecture revision, interleaves with the spine):
      dispatch preflight; expose the mint core for in-process use by the
      workflow. Removing the retired `NS_DISPATCH_SANDBOX_MINT_SECRET`
      production variable is **deferred out of the e2e prototype** (Runner
      Policy, 2026-07-13): env-var mutations are human-only cleanup after the
      prototype, and the autorun loop neither performs nor stops for them.
      Policy: mint-core exposure and preflight are runner steps (pure code,
      fake-driven tests); nothing in this row needs a live interlude.
      Both remaining items completed 2026-07-13 in the code-first autorun run
      (code-first-run-spine-and-steel-thread-coded Semantic Update): the mint
      core is an in-process seam (`DispatchTokenMinter`) with the HTTP route a
      thin adapter over it, and `ns dispatch prompt` carries the credentials
      preflight (named, value-free failure categories). In-process minting
      from deployed workflow-step compute is pending the batched live pass.
      Note: the mint runtime config still requires the retired
      `NS_DISPATCH_SANDBOX_MINT_SECRET` variable until the deferred cleanup
      (or a prior code change dropping the requirement).
- [~] Workflow spine probes — three staged probes on the existing
  deployable, in order, each folding proven facts into the README and
  extending the `build:deployable` gate before anything depends on it.
  Makes true: "Under the hood" (the workflow-supervised execution
  story). (1) **workflow-hello-probe**: a trivial workflow + step
  deployed and triggered end-to-end through an authenticated trigger
  route (Development OIDC on the dispatch-owned header, reusing the
  verified mint-route trust machinery) calling the Workflow SDK's
  `start()`, returning the run id, observed to completion via
  `getRun` — de-risks `"use workflow"`/`"use step"` packaging through
  Vercel's workflow builder and Queues wiring, the proven
  escape-local-validation risk class, and surfaces Queues availability
  as a setup precondition. (2) **sandbox-in-workflow probe**: the
  verified private-repository Sandbox hello probe lifted into workflow
  steps with the clone token minted in-process. (3) **long-run
  supervision probe**: a detached command in the sandbox exceeding a
  single function invocation ceiling (>13 minutes), supervised by
  short poll steps and zero-compute `sleep()`s, with a clean `getRun`
  status trail and cleanup on every path — retires the run-length
  concern structurally. Gated by the credentials row's mint core;
  gates the steel thread.
  Policy: each probe's *code* (entrypoints, trigger route, gate
  extension) is runner-step work; the deploy → trigger → observe →
  cleanup cycle is a parent interlude under the Runner Policy's
  pre-authorized actions, with proven facts hand-committed by the
  parent. Autorun phase 1 (decision 2026-07-13) is, in order: (1) the
  `build:deployable` gate extension for `"use workflow"`/`"use step"`
  packaging — before any workflow code lands, so step validation
  predicts deployability; (2) mint-core in-process exposure (from the
  credentials row); (3) probe-1 code; then interlude 1 deploys,
  triggers, observes via `getRun`, and folds facts. Probe-2/3 code
  waits for probe-1's proven facts. Amended 2026-07-13
  (code-first-autorun-restructure Semantic Update): the autorun run
  builds probe-2/3 and steel-thread code ahead of live probe facts;
  all deploy/trigger/observe work batches into one live pass after
  the code run, which alone may fold verification claims.
  Code complete 2026-07-13
  (code-first-run-spine-and-steel-thread-coded Semantic Update): all
  three probe code slices plus the gate extension are locally green
  on the run's stack; remaining is the batched live
  deploy/trigger/observe pass.
- [~] Steel thread: `ns dispatch prompt` end-to-end under the dispatch
  workflow. Local CLI: preflight, dirty-tree refusal listing dirty
  files, push-first when the remote is missing/behind, anchor
  `dispatch/` branch + PR opened up front on the user's own
  credentials, trigger-route call, workflow run id stamped on the
  anchor PR. Workflow: in-process clone-token mint, sandbox creation
  over the exact dispatched SHA, provisioning and detached launch of
  the ns-owned pi runner (over `@earendil-works/pi-coding-agent`,
  headless, repo skills from the checkout), poll/sleep supervision,
  in-process landing mint injected into the single landing command,
  produced commits landed on the anchor branch, decision log in the PR
  description, failure comment path leaving the anchor PR open and
  marked failed. Launch step `maxRetries 0`; landing and reporting
  steps idempotent. Makes true: "Quick start" (prompt path), "What the
  remote agent sees", and "The anchor PR". Gated by the spine probes
  (amended 2026-07-13, code-first-autorun-restructure Semantic Update:
  the gate applies to live verification and fact-folding; the code
  sub-slices below proceed ahead of live probe facts in the code-first
  autorun run). Ordered sub-slices (deploy-before-verify dependency structure,
  recorded 2026-07-13 — what must be deployed before what can be
  verified):
  1. Workflow-side code: the dispatch workflow (in-process mint,
     sandbox over exact SHA, poll/sleep supervision, landing-mint
     injection, idempotent landing/reporting steps) — verifiable only
     after a deploy interlude.
  2. The ns-owned pi runner package (headless over
     `@earendil-works/pi-coding-agent`) — locally testable against the
     library API; live behavior needs a deployed workflow to host it.
  3. CLI-side code: preflight, dirty-tree refusal, anchor
     branch/PR-up-front logic, trigger-route call, run-id stamping —
     locally testable with fakes; live verification needs the deployed
     workflow *and* the per-action-consented anchor push/PR.
  4. End-to-end interlude: real `ns dispatch prompt`, observed to a
     landed anchor PR.
     Policy: sub-slices 1–3 decompose into runner steps (each locally
     green per the Definition of Progress); every deploy/trigger/observe
     cycle is a parent interlude; the anchor-branch push and PR
     creation/mutation in 3–4 are the Runner Policy's per-action consent
     gate.
     Sub-slices 1–3 code complete 2026-07-13
     (code-first-run-spine-and-steel-thread-coded Semantic Update): the
     dispatch workflow, the ns-owned pi runner with the `ns.toml`
     `[dispatch]` harness recipe, and the `ns dispatch prompt` kernel
     command (with `deployment_url` in the `[dispatch]` table) are
     locally green on the run's stack. Remaining: sub-slice 4, the live
     end-to-end interlude.
- [ ] Reusable workflow-supervised dispatch setup skill, distilled from the
      proven credentials, spine-probe, and steel-thread work rather than
      authored ahead of it. Makes true: "Setup" as an executable
      agent-guided path for a fresh repository — GitHub App
      registration/installation, Vercel project linkage, workflow
      deployment and Queues availability, environment-variable names and
      sensitivity, repo-local `[dispatch]` configuration, preflight, and a
      controlled workflow-supervised dispatch probe — without reading or
      recording secret values. Proven facts to preserve include
      existing-App key generation through GitHub's UI versus initial
      creation through the App Manifest flow; Vercel sensitive-variable
      replacement rather than rename/readback; OIDC trust values derived
      from actual non-secret claims; read-only App/installation/repository
      checks; precise `.env.local` ignore hygiene; and the requirement that
      probe SHAs be remotely reachable. Treat
      `references/vercel-sandbox-github-integration-field-guide.md` as the
      setup tool's acceptance checklist: package-root tracing and
      emitted-artifact verification; package-directory link/build/env-pull
      versus repository-root deployment; reserved versus caller-owned OIDC
      headers; phased clone/work/landing credentials; safe status-only
      probes; explicit consent before billable Sandbox creation; mandatory
      cleanup; retry-after-inspect behavior for ambiguous deployment
      transport failures; and prototype debt with named cleanup (overbroad
      App permissions, pending mint-secret variable removal). The tool must
      expose actionable safe failure categories without reading, echoing,
      persisting, or accepting secrets on argv. During the preceding rows,
      continuously fold real setup facts and failure modes into the
      canonical README and Semantic Updates when materially meaningful.
      Before authoring, settle whether the skill is a module-bundled
      `@nseng-ai/vercel` artifact or a one-shot project-setup leaf and apply
      `docs/conventions/skill-conventions.md`; do not create the skill
      before the steel thread proves the workflow.
- [ ] `ns dispatch plan`: a real plan dispatched and executed remotely to
      the same git-native landing bar (the subsumed dispatch-extension's
      completion bar). Makes true: "Commands → /ns:dispatch:plan". The
      kernel CLI takes an explicit plan reference (plan machinery:
      `ts/packages/capabilities/plans`); `/ns:dispatch:plan` no-arg
      latest-plan resolution is Pi session sugar. Wrapper-skill coverage
      lands with the commands so the same surface is reachable from Claude
      Code and Codex. Includes the long-run completion evidence: at least
      one verified dispatch whose wall-clock exceeds a single function
      invocation ceiling.
      Policy: command core, wrapper skills, and scenario tests are runner
      steps; the real dispatch and the long-run evidence are parent
      interludes (anchor push/PR under per-action consent).
- [ ] `/ns:dispatch:session`: continue the current session remotely. Makes
      true: "Commands → /ns:dispatch:session". The kernel command is
      `ns dispatch handoff <ref>` (explicit handoff reference, continuation
      prompt baked in — seam-design decision); input machinery is the
      existing handoffs capability (`ts/packages/capabilities/handoffs`).
      Pi sugar captures the session's working context as a handoff and
      dispatches it; lands on the anchor PR like any dispatch; the standard
      clean-tree rule applies unchanged.
      Policy: same seam as `ns dispatch plan` — code and tests in runner
      steps, live dispatch in a parent interlude.
- [ ] Dispatch jobs TUI: view the status of all outstanding dispatch jobs
      (running / landed / failed, each with its anchor PR; failed ones with
      reason and access to run logs). Makes true: "The dispatch jobs TUI".
      Plumbing per the seam-design row, concretized 2026-07-13: enumerate
      `dispatch/` anchor PRs, read each PR's stamped workflow run id, query
      Vercel's run observability (`getRun` — status, event/log stream) for
      run state and logs. Owns the README open question: the TUI's command
      name and whether any push-style notification exists beyond the TUI
      and the anchor PR.
      Policy: TUI code against faked gateways is runner-step work; live
      confirmation reads real runs in an interlude (read-only, fully
      pre-authorized).
- [ ] Claude Code as the second in-sandbox harness, running through its
      headless CLI behind the same supervisor, proving the in-sandbox
      harness is repo configuration — a provisioning recipe plus an
      invocation command — rather than code shape. Makes true: "Under the
      hood" (harness/model is preconfigured; no per-dispatch flag).
      Policy: the provisioning recipe and configuration are runner steps;
      proving the second harness is a dispatch interlude.
- [ ] Durable jobs trigger: nightly objective advancement as a Vercel cron
      entry on the deployable that starts the same dispatch workflow per
      advanced objective, landing the identical per-unit contract (anchor
      PR per advanced objective; never merge or land without human
      review). Makes true: "Scheduled cloud work". Owns the README open
      question — the advancement policy: which objectives qualify, what an
      objective must declare (e.g. `## Runner Policy`) to opt in, what ref
      scheduled runs dispatch from (a job has no "current branch"), and
      the human review loop — recorded as a Semantic Update.
      Policy: cron/workflow entrypoint code is a runner step; the
      advancement-policy decision is user-owned (stop/ask), and enabling
      or observing real nightly runs is parent/human interlude work.
- [ ] Promote the settled README to
      `ts/packages/capabilities/vercel/README.md`, repoint this Objective's
      canonical reference at the promoted doc, and re-derive or retire
      `orientation.md`.

## Parked

- Automatic handoff generation for dispatched results (cut from the initial
  happy path, user decision 2026-07-12): the anchor PR is the pickup
  surface; a result handoff may return later as an add-on.
- Snapshot-based sandbox rotation for runs beyond the 5-hour sandbox cap
  (workflow SDK sandbox cookbook pattern); v1 caps run duration under it.
- Warm harness sandbox templates/snapshots to amortize per-run harness
  provisioning cold-start; v1 installs per run.
- Additional scheduled jobs beyond the proving one — e.g. automated smart
  rebases of outstanding branches so merge conflicts are dealt with
  automatically (named in the README as an example).
- cmux local target: retarget the existing Pi/ccc dispatch flows behind
  a dispatch backend selection (over the `@nseng-ai/ccc` cmux cores), Pi
  `/ccc:workspace:dispatch-*` becoming thin bridges, plus the ccc bin
  repair-or-retire decision. Parked per user decision 2026-07-12: the demo
  doesn't need it and the retarget carries daily-driver regression risk;
  existing dispatch flows keep working unchanged meanwhile.
- Eve integration (channels, Slack sessions, durable HITL park/resume) as a
  consumer of the seams; also the recorded revisit trigger for
  driver-in-workflow harness hosting (see seam-design §9).
- Event-driven issue→triage→fix loops and speculative execution of
  objectives (ideas preserved from the retired
  `docs/wayfinding/ns-cloud-capabilities/` map; recover detail from git
  history).
