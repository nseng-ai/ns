# Cloud Dispatch Seam and Capability Design

Settled 2026-07-12 in a grill session (decision trail in the
`vercel-native-seam-design-settled` Semantic Update). This note records the
seam-design roadmap row's decisions with rationale against alternatives. The
canonical user-facing contract remains `references/README-draft.md`; this
note holds contracts and rationale and never overrides the README.

**Governing stance: Vercel-native, deliberately.** The capability is named
after Vercel — *do not overpromise generality*. There is no
backend-pluggability seam, internal or public, and no design obligation to a
hypothetical GitHub Actions backend. This reverses the earlier "thin seams,
pluggable backends" thesis on purpose: naming the coupling is more honest
than abstracting over one implementation.

## 1. Package: `@nseng-ai/vercel` at `ts/packages/capabilities/vercel`

One package, three residents: the `ns dispatch` command group, the Vercel
Sandbox executor, and the Vercel Workflows jobs leg. Everything in it is
Vercel-coupled, and the name says so.

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
name what dispatch needs (create a sandbox over a repo checkout with
per-run injected credentials, run the harness, query run state, fetch run
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

At submission, dispatch stamps the run identity (run/sandbox id, enough to
query Vercel observability) into the anchor PR. The jobs TUI enumerates
dispatch anchor PRs, reads the handle, and queries Vercel for run state and
logs. Git/GitHub-native like all ns durable state; works from any machine;
no local ledger to lose.

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

Vercel Workflows are deployed code, so the package carries its own
deployable: the workflow/cron entrypoints and Vercel project config live in
a subdirectory of `ts/packages/capabilities/vercel`, and the dispatch
Vercel project roots there. One home for the whole Vercel story.

The durable-jobs contract is unchanged: the job layer schedules and
supervises; a job's body invokes the same dispatch core that serves
interactive dispatch; scheduled jobs never merge or land anything without
human review.

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
