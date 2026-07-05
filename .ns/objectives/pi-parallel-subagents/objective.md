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
- Preview + pointer result plumbing: bounded preview in parent context, full findings on
  disk.
- Live inline progress rendering for the fan-out (per-task status rows, tool activity,
  done/running counts).
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
- Parent context receives a bounded preview plus a pointer (file path or result handle);
  full findings live on disk.
- The fan-out renders live inline progress: per-task status icons, recent tool activity,
  and a done/running counter.
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
  "cheaper model by default" completion criterion outside it.

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
  only (`.ns/pi/agents/explorer.md`). Decision pending (accept, inject the guard via
  the existing `--extension runtimeExtensionPath` seam in `subagent-process.ts`, or
  document why prompt-scoping suffices); tracked as an open question and roadmap item.

## Open Questions

- ~~Adopt, fork, or build — the spike's outcome (roadmap item 1).~~ Resolved
  2026-07-02: **build** on the runner-subagent substrate
  (`updates/2026-07-02-adopt-vs-build-decision.md`).
- ~~If built: where the engineered implementation lives (`ts/packages/local/pi-tools`
  alongside runner-subagents vs `ts/packages/hosts/pi`) and its promotion path.~~
  Resolved 2026-07-02: `ts/packages/local/pi-tools` alongside runner-subagents, as
  engineered platform code from the start (same update). Since moved with the rest of
  pi-tools to `ts/packages/internal/pi-tools`.
- How to close the explorer-child home-directory-guard bypass (see Risks): accept,
  inject the guard extension through the `runtimeExtensionPath` seam, or document
  prompt-scoping as sufficient.
- Whether the in-process fork-runtime adapter is worth the Pi SDK coupling, and what the
  runtime seam looks like (Gateway-style interface with subprocess + in-process
  adapters).
- Whether `/investigate` (in-process today, with a recorded parity gap vs Claude Code's
  out-of-process investigator) should migrate onto the explore substrate.
