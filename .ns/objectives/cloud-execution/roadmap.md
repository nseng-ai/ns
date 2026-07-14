# Roadmap

## Work

- [ ] Design the two seams and the dispatch capability: the remote-execution
      backend gateway contract (inputs: repo ref + plan/prompt + credentials;
      outputs: pushed branch + handoff/branch-memory record), the durable-jobs
      contract (jobs invoke the execution seam, no agent logic in the job
      layer), command shapes (`ns dispatch plan|prompt --target`), and the
      capability package home and name. Read
      `docs/conventions/consumer-gateways-and-command-shape.md` and
      `ts/AGENTS.md` before shaping the CLI.
- [ ] Credentials slice: the minimal credentials model for Vercel Sandbox
      execution — repo access, push scope, model keys — recorded as a
      Semantic Update before the executor runs real work.
- [ ] Steel thread: `ns dispatch prompt --target cloud` end-to-end on Vercel
      Sandbox via the `@ai-sdk/harness-pi` adapter with ns skills injected;
      lands a pushed branch plus handoff/branch-memory record the
      dispatching side can pick up.
- [ ] `ns dispatch plan --target cloud`: a real plan dispatched and executed
      remotely to the same git-native landing bar (the subsumed
      dispatch-extension's completion bar).
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

## Parked

- cmux local target: retarget the existing Pi/ccc dispatch flows behind
  `ns dispatch --target cmux` (over the `@nseng-ai/ccc` cmux cores), Pi
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
