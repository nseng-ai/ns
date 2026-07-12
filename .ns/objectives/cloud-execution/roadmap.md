# Roadmap

## Work

- [~] Settle the canonical README (`references/README-draft.md`) through the
  readme-driven-development loop: draft as finished product documentation
  for a cloud-dispatch user, grill every unsettled decision it exposes,
  fold answers back until coherent.
  - Settled at creation: the README documents the in-harness experience,
    Pi first (`/ns:dispatch:*` mirrors; user decision 2026-07-12), with the
    `ns dispatch plan|prompt --target cloud` kernel CLI as the under-the-hood
    substrate; git-native return path (pushed branch + handoff/branch-memory
    record); scheduled jobs never merge or submit without human review.
  - Grilled 2026-07-12 (pass 1): `/ns:dispatch:plan` no-arg = latest session
    plan (Pi sugar; CLI stays explicit); dispatch jobs status TUI committed;
    credentials are Vercel-native (sensitive env vars + OIDC + secret-free
    sandboxes with per-run injection); dispatch is repo-local; slots stay a
    local concept. Deferred: nightly advancement policy (durable-jobs row).
  - Grilled 2026-07-12 (pass 2): dispatched ref = current branch head
    (pushed first if needed); dirty tree refuses; result = new child branch
    plus open PR plus handoff (scheduled jobs identical; guardrail is
    never-merge/land, not never-open-PRs); `cloud` is the default target;
    failures are TUI-only (nothing lands in git; run state/logs from the
    backend's observability); runs strictly non-interactive with a decision
    log in the PR description and logs; no validation promise yet (tighten
    with confidence); harness/model is backend detail, no flag.
  - Grilled 2026-07-12 (pass 3, live README review): automatic handoff
    generation cut from the result path (parked as a later add-on; the
    result is branch + PR only); `/ns:dispatch:session` added — continue
    the current session remotely via a handoff carrying session context
    plus a predefined continuation prompt (handoffs are now dispatch
    *input* machinery, not output); `--target` dropped — the execution
    backend is repo-configured, no per-dispatch flag; the PR is created
    **up front, before job submission**, as the job's observability anchor;
    failed runs leave the anchor PR open and marked failed (supersedes
    pass 2's "failures land nothing in git"); nightly advancement demoted
    to one example of scheduled jobs (smart-rebase of outstanding branches
    named as another).
  - Remaining open README questions live in the README itself and
    `objective.md` (TUI shape, git-credential minting, advancement policy).
- [ ] Design the two seams and the dispatch capability: the remote-execution
      backend gateway contract (inputs: repo ref + plan/prompt + credentials;
      outputs: anchor branch + PR, opened before job submission), the
      durable-jobs contract (jobs invoke the execution seam, no agent logic
      in the job layer), command shapes (`ns dispatch plan|prompt` plus the
      session-continuation surface; backend repo-configured, no `--target`
      flag), and the capability package home and name. Read
      `docs/conventions/consumer-gateways-and-command-shape.md` and
      `ts/AGENTS.md` before shaping the CLI.
- [ ] Credentials slice: implement the Vercel-native credentials story
      (grill decision 2026-07-12) — model keys as sensitive env vars on the
      dispatch project, OIDC executor auth (dev token via `vercel env pull`
      locally), secret-free sandboxes with per-run injected credentials —
      and decide the per-run scoped git-credential minting mechanism
      (fine-grained PAT vs. GitHub App installation token), recorded as a
      Semantic Update before the executor runs real work.
- [ ] Steel thread: `ns dispatch prompt` end-to-end on Vercel Sandbox via
      the `@ai-sdk/harness-pi` adapter with ns skills injected; opens the
      anchor branch + PR up front and lands the produced commits on it.
- [ ] `ns dispatch plan`: a real plan dispatched and executed remotely to
      the same git-native landing bar (the subsumed dispatch-extension's
      completion bar).
- [ ] `/ns:dispatch:session`: continue the current session remotely —
      capture the session's working context as a handoff, dispatch with the
      predefined continuation prompt, land on the anchor PR like any
      dispatch.
- [ ] Dispatch jobs TUI: view the status of all outstanding dispatch jobs
      (running / landed / failed, each with its anchor PR). Run state and
      logs come from the backend's own observability (Vercel Sandbox /
      Workflows), queried through the backend seam; plumbing decided with
      the seam design.
- [ ] Claude Code adapter (`@ai-sdk/harness-claude-code`) as the second
      in-sandbox harness behind the same seam, proving the seam is
      harness-agnostic.
- [ ] Durable jobs leg: nightly objective advancement on Vercel Workflows
      (+ cron) whose body invokes the executor core; includes the
      advancement-policy decision (which objectives qualify, guardrails,
      human review loop) recorded as a Semantic Update.
- [ ] GitHub-compute pluggability audit: verify the seam contracts contain
      nothing Vercel-shaped and record a design note on what a GitHub
      Actions backend would require. No build.
- [ ] Promote the settled README to the dispatch capability package's README
      under `ts/packages/` (home decided with the package name in the
      seam-design row), repoint this Objective's canonical reference at the
      promoted doc, and re-derive or retire `orientation.md`.

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
