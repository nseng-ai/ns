# Roadmap

Row order is dependency order: the credentials row gates the steel thread
(the seam-design row settled 2026-07-12), and every row after the steel
thread widens it. Each
implementation row names the README (`references/README-draft.md`) sections
it makes true — the README is the contract, the row is the slice, and a
row's outcome folds back into the README rather than settling anywhere else.
The credentials and steel-thread slices also collect the exact setup inputs,
ordering, failure modes, and safe verification evidence needed by the later
setup-skill row; they never record secret values.

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
- [x] Seam and capability design — the decision row that unblocks all
      implementation. Settled 2026-07-12 in a grill session; decisions with
      rationale in `references/seam-design.md` plus the
      vercel-native-seam-design-settled Semantic Update. Headline reversal:
      **Vercel-native, deliberately** — the package is `@nseng-ai/vercel`
      at `ts/packages/capabilities/vercel` (one package: commands, Sandbox
      executor, Workflows jobs leg, and its own Vercel deployable; flow's
      export shape as precedent), gateways speak Vercel vocabulary (faked
      for tests; no backend-agnostic executor contract), and GitHub-compute
      pluggability is dropped entirely. Kernel commands are
      `ns dispatch plan|prompt|handoff`; anchor branches are
      `dispatch/`-prefixed; the run handle is stamped on the anchor PR;
      repo configuration is the typed `ns.toml` `[dispatch]` table.
- [~] Credentials slice — gates the steel thread running real work. Makes
  true: "Setup". **Design settled 2026-07-12** (research note
  `references/git-credential-minting-research.md`, decisions in
  `references/credentials-design.md` + the credentials-design-settled
  Semantic Update): GitHub App installation tokens (per-run PAT minting
  is impossible — web-UI only), late-mint at push time (clone token /
  tokenless work / fresh landing token), local anchor setup on the
  user's own credentials, v1 sandbox self-landing with a shared mint
  secret (upgrades recorded: Vercel-side supervisor, per-run landing
  voucher), org-owned `ns-dispatch` app with its key in a sensitive env
  var. Posture: racing to e2e; shortcuts carry named upgrades.
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
  for clone credentials or the prototype shared landing secret, then mints
  narrow GitHub App installation tokens. A fixed private-repository Sandbox
  hello probe checks out an exact SHA, verifies a safe marker/HEAD result,
  and attempts cleanup; the canonical README records the proven local setup
  order and safe failure signals. The runtime, probe, tests, and README now
  use one `NS_DISPATCH_*` namespace for all nine dispatch-owned environment
  variables; generic model keys and Vercel's `VERCEL_OIDC_TOKEN` remain
  unchanged. Targeted package tests and workspace typecheck pass. Linked-project
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
  clone-purpose mint passed without exposing its token. Remaining (interleaves with the steel
  thread): add dispatch preflight.
- [ ] Steel thread: `ns dispatch prompt` end-to-end on Vercel Sandbox via
      the `@ai-sdk/harness-pi` adapter with ns skills injected via the
      Agent Skills standard. Makes true: "Quick start" (prompt path),
      "What the remote agent sees" (dirty-tree refusal listing dirty files;
      push-first when the remote is missing/behind), and "The anchor PR"
      (`dispatch/` branch + PR opened up front before job submission with
      the run handle stamped on the PR; produced commits land on the anchor
      branch; decision log in the PR description; failed runs leave the
      anchor PR open and marked failed with a failure comment). Gated by
      the credentials row.
- [ ] Reusable Vercel Sandbox + GitHub setup skill, distilled from the
      proven credentials and steel-thread work rather than authored ahead of
      it. Makes true: "Setup" as an executable agent-guided path for a fresh
      repository — GitHub App registration/installation, Vercel project
      linkage, environment-variable names and sensitivity, repo-local
      `[dispatch]` configuration, preflight, and a controlled Sandbox dispatch
      probe — without reading or recording secret values. Proven facts to
      preserve include existing-App key generation through GitHub's UI versus
      initial creation through the App Manifest flow; Vercel sensitive-variable
      replacement rather than rename/readback; OIDC trust values derived from
      actual non-secret claims; read-only App/installation/repository checks;
      precise `.env.local` ignore hygiene; and the requirement that probe SHAs
      be remotely reachable. Treat
      `references/vercel-sandbox-github-integration-field-guide.md` as the
      setup tool's acceptance checklist: package-root tracing and
      emitted-artifact verification;
      package-directory link/build/env-pull versus repository-root deployment;
      reserved versus caller-owned OIDC headers; phased clone/work/landing
      credentials; safe status-only probes; explicit consent before billable
      Sandbox creation; mandatory cleanup; retry-after-inspect behavior for
      ambiguous deployment transport failures; and prototype security debt with
      named upgrades. The tool must expose actionable safe failure categories
      without reading, echoing, persisting, or accepting secrets on argv. During
      the preceding rows, continuously fold real setup facts and failure modes
      into the canonical README and Semantic Updates when materially meaningful.
      Before authoring, settle whether the
      skill is a module-bundled
      `@nseng-ai/vercel` artifact or a one-shot project-setup leaf and apply
      `docs/conventions/skill-conventions.md`; do not create the skill during
      the current mint-endpoint slice.
- [ ] `ns dispatch plan`: a real plan dispatched and executed remotely to
      the same git-native landing bar (the subsumed dispatch-extension's
      completion bar). Makes true: "Commands → /ns:dispatch:plan". The
      kernel CLI takes an explicit plan reference (plan machinery:
      `ts/packages/capabilities/plans`); `/ns:dispatch:plan` no-arg
      latest-plan resolution is Pi session sugar. Wrapper-skill coverage
      lands with the commands so the same surface is reachable from Claude
      Code and Codex.
- [ ] `/ns:dispatch:session`: continue the current session remotely. Makes
      true: "Commands → /ns:dispatch:session". The kernel command is
      `ns dispatch handoff <ref>` (explicit handoff reference, continuation
      prompt baked in — seam-design decision); input machinery is the
      existing handoffs capability (`ts/packages/capabilities/handoffs`).
      Pi sugar captures the session's working context as a handoff and
      dispatches it; lands on the anchor PR like any dispatch; the standard
      clean-tree rule applies unchanged.
- [ ] Dispatch jobs TUI: view the status of all outstanding dispatch jobs
      (running / landed / failed, each with its anchor PR; failed ones with
      reason and access to run logs). Makes true: "The dispatch jobs TUI".
      Plumbing per the seam-design row: enumerate `dispatch/` anchor PRs,
      read each PR's stamped run handle, query Vercel's own observability
      (Sandbox / Workflows) for run state and logs. Owns the README open
      question: the TUI's command name and whether any push-style
      notification exists beyond the TUI and the anchor PR.
- [ ] Claude Code adapter (`@ai-sdk/harness-claude-code`) as the second
      in-sandbox harness behind the same gateways, proving the in-sandbox
      harness is repo configuration rather than code shape. Makes true:
      "Under the hood" (harness/model is preconfigured; no per-dispatch
      flag).
- [ ] Durable jobs leg: nightly objective advancement on Vercel Workflows
      (+ cron) whose body invokes the executor core and lands the identical
      per-unit contract (anchor PR per advanced objective; never merge or
      land without human review). Makes true: "Scheduled cloud work". Owns
      the README open question — the advancement policy: which objectives
      qualify, what an objective must declare (e.g. `## Runner Policy`) to
      opt in, what ref scheduled runs dispatch from (a job has no "current
      branch"), and the human review loop — recorded as a Semantic Update.
- [ ] Promote the settled README to
      `ts/packages/capabilities/vercel/README.md`, repoint this Objective's
      canonical reference at the promoted doc, and re-derive or retire
      `orientation.md`.

## Parked

- Automatic handoff generation for dispatched results (cut from the initial
  happy path, user decision 2026-07-12): the anchor PR is the pickup
  surface; a result handoff may return later as an add-on.
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
  consumer of the seams.
- Event-driven issue→triage→fix loops and speculative execution of
  objectives (ideas preserved from the retired
  `docs/wayfinding/ns-cloud-capabilities/` map; recover detail from git
  history).
