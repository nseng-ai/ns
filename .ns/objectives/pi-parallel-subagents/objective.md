# Pi Parallel Subagents

## Thesis

Claude Code's parallel Explore agents — cheap read-only researchers fanned out mid-task —
are a capability Pi deliberately omits from core but fully supports via extensions. ns
already owns the hard substrate pieces (the subprocess `dispatchRunnerSubagent` primitive
and thermo-council's parallel worker pool) but has no model-invocable fan-out tool, no
capability-enforced read-only explorer, no scout-sized result preview (the substrate's
existing context economy is a 48k-char cap with a session-file pointer on truncation;
the gap is a bounded ~5k scout preview), and weak live monitoring. A survey (2026-07-02) of six existing implementations — Pi's first-party
example, tintinweb/pi-subagents, nicobailon/pi-subagents, gotgenes/pi-packages,
mjakl/pi-subagent, and oh-my-pi's in-core task system (checkouts under
`~/code/githubs/`) — shows every hard problem already solved somewhere in adoptable or
borrowable form. This objective delivers Claude-Code-style parallel explore subagents in
Pi, deciding first whether to adopt an off-the-shelf extension or build on the
runner-subagent stack. The governing priorities are **low maintenance burden** and
**control over prompt engineering and UX**; speed-to-capability is not a differentiator
(either path can be vibe-coded quickly), and subsuming the handrolled runner-subagent
stack is a desirable bonus, not a requirement.

## Scope

- Adopt-vs-build decision spike against the stated priorities, including "could this
  candidate subsume `dispatchRunnerSubagent` + thermo-council" as an explicit criterion.
- A model-invocable tool the main Pi agent uses to fan out parallel read-only explorers
  mid-task, with parent-facing prompt engineering (when to fan out, how to scope tasks,
  breadth vocabulary).
- An explorer agent definition: cheap-model default, strict scout output contract,
  read-only enforced by tool allowlist (no `bash`/`edit`/`write`), with dispatch-time
  auth fallback and runtime model failover.
- Direct parent-context findings shaping: bounded scout findings appear directly in
  the parent context, with existing child session-file pointers as the overflow/debug
  path (no new durable findings artifact or retrieval command for this slice).
- Live inline progress rendering for the fan-out (per-task status rows, tool activity,
  done/running counts).
- Extraction/shipping of the dogfooded capability as a properly formed Pi extension
  package named `ns-pi-subagents`, rather than leaving it only as this repo's
  `.pi/extensions/` shim over internal code.
- Non-blocking follow-on slices: fleet widget + transcript viewer, an in-process
  (`createAgentSession`) runtime adapter for context-forking use cases, and
  consolidation of the existing runner-subagent stack onto the chosen substrate.

## Non-Goals

- Parallel *writer* subagents and their machinery: worktree/CoW isolation, inter-agent
  coordination channels (oh-my-pi's `irc`), merge/patch flows.
- Cron/scheduling, persistent agent memory, and other kitchen-sink extension features
  surveyed in tintinweb/nicobailon.
- Upstreaming anything to Pi core.
- Claude Code-side changes; this is a Pi-host capability (cross-harness parity notes may
  reference it).

## Completion Criteria

- From a Pi session in this repo, the main agent fans out two or more parallel read-only
  explorers via a tool call, on a cheaper model by default, and synthesizes their
  findings.
- The explorer's tool allowlist excludes `bash`, `edit`, and `write` — read-only is
  capability-enforced, not prompt-enforced.
- Parent context receives bounded scout findings directly (about 8k chars per task and
  32k total) plus child Pi session-file pointers for overflow/debug inspection.
- The fan-out renders live inline progress: per-task status icons, recent tool activity,
  and a done/running counter.
- The dogfooded implementation is packaged as `ns-pi-subagents`, a properly formed Pi
  extension package with a clean install/registration surface and no reliance on a
  repo-local shim for normal use.
- The adopt-vs-build decision is recorded as an update with per-candidate rationale
  against the priorities (maintenance burden, prompt/UX control, subsumption potential).

## Assumptions and Risks

Assumptions:

- Pi 0.80.x's extension API surface (`registerTool` with streaming `renderResult`,
  `--mode json -p` children, `--tools` allowlists, agent `.md` definitions) stays stable
  enough that work built now survives upstream churn.
- The 2026-07-02 survey findings remain representative; candidates are very active
  (nicobailon and tintinweb released within days of the survey), so the spike should
  re-check heads before deciding.
- A Haiku-class cheap model produces useful recon when held to a strict output contract
  (`## Files Retrieved` with line ranges, `## Key Code`, `## Start Here`).
- The repo's two-layer Pi model (vibecoded `.pi/extensions/` shim → engineered
  `ts/packages/`) is the delivery path, so speed does not require adopting.
- The cheap-model policy is Anthropic-only by accepted scoping:
  `resolveExplorerLaunchPlan` downshifts to Haiku only for Anthropic-family parents or
  when Anthropic auth is configured; non-Anthropic sessions inherit the parent model at
  full price. Acceptable for this repo's dogfood environment, but in tension with the
  "cheaper model by default" completion criterion outside it. The two cheap paths can
  also diverge: Anthropic-family parents get the `haiku` shorthand (resolved by Pi at
  child launch) while the auth-probe path pins `anthropic/claude-haiku-4-5`
  (`contract.ts`); when Anthropic ships the next Haiku, the shorthand upgrades with Pi
  and the pin does not. Any divergence should be a recorded decision, not drift.

Risks:

- Adoption cedes prompt/UX control to fast-moving upstream authors; forking recovers
  control but re-acquires the maintenance burden it was meant to avoid. The spike must
  price fork-and-own honestly, not just adopt-as-is.
- Building means owning churn against Pi's fast release cadence at the SDK boundary —
  the survey found in-process consumers pinned to narrow Pi version ranges with
  pervasive type escapes.
- Excluding `bash` from explorers loses shell-based recon (`git log`, `git blame`,
  ad-hoc pipelines); if recon quality suffers, a vetted read-only command tool becomes a
  follow-on need rather than re-admitting `bash`.
- Consolidation is judged unlikely (runner-subagents carries ns-specific result
  taxonomy and curated git evidence no candidate replicates); it is expected to park
  rather than complete.
- Explorer children launch with `--no-extensions`, which is part of the read-only
  guarantee but also strips `.pi/extensions/home-directory-guard.ts` — a child with
  `grep`/`find` has no home-root guard and no cwd jail, so *scope* is prompt-enforced
  only (`.ns/pi/agents/explorer.md`). Resolved 2026-07-05: accept prompt-level local
  policy via a root `AGENTS.local.md` convention for dogfooding, with this checkout's
  ignored local file carrying the workstation-specific home-root rule
  (`updates/2026-07-05-explorer-local-policy-decision.md`). This is an accepted
  limitation, not a sandbox or extension-equivalent guard; revisit child extension
  injection only if dogfood shows prompt-level policy is insufficient.

## Open Questions

- ~~Adopt, fork, or build — the spike's outcome (roadmap item 1).~~ Resolved
  2026-07-02: **build** on the runner-subagent substrate
  (`updates/2026-07-02-adopt-vs-build-decision.md`).
- ~~If built: where the engineered implementation lives (`ts/packages/local/pi-tools`
  alongside runner-subagents vs `ts/packages/hosts/pi`) and its promotion path.~~
  Resolved 2026-07-02: `ts/packages/local/pi-tools` alongside runner-subagents, as
  engineered platform code from the start (same update). Since moved with the rest of
  pi-tools to `ts/packages/internal/pi-tools`.
- ~~How to close the explorer-child home-directory-guard bypass (see Risks): accept,
  inject the guard extension (requires a new caller-facing extension-injection option
  on the dispatch surface — no existing seam reaches `--extension` for final-text
  children), or document prompt-scoping as sufficient. Gates roadmap item "Dogfood in
  real ns work".~~ Resolved 2026-07-05: accept prompt-level `AGENTS.local.md` local
  policy for dogfooding; no extension-injection seam in this slice
  (`updates/2026-07-05-explorer-local-policy-decision.md`).
- ~~Whether the in-process fork-runtime adapter is worth the Pi SDK coupling, and what the
  runtime seam looks like (Gateway-style interface with subprocess + in-process
  adapters).~~ Resolved 2026-07-05: add an explicit `ExplorerRuntime` seam; keep
  subprocess dispatch as the default runtime; expose the in-process adapter only through
  explicit injection for future context-forking dogfood
  (`updates/2026-07-05-optional-follow-ons-implemented.md`).
- ~~Whether `/investigate` (in-process today, with a recorded parity gap vs Claude Code's
  out-of-process investigator) should migrate onto the explore substrate.~~ Resolved
  2026-07-05: eliminated in both harnesses; explore absorbs the use case including
  single-task deep investigations
  (`updates/2026-07-05-investigate-eliminated-explore-single-task.md`).
- ~~The exact package boundary for `ns-pi-subagents`: whether it remains an ns-internal
  workspace package first or is prepared for external distribution immediately.~~
  Resolved 2026-07-05: ship as a private ns workspace Pi extension package first;
  external distribution still requires extracting or bundling the internal
  runner-subagent substrate (`updates/2026-07-05-ns-pi-subagents-package-created.md`).
