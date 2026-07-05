# Adopt-vs-Build Decision: Build on the Runner-Subagent Substrate

## Summary

The adopt-vs-build spike (roadmap item 1) is complete. Seven parallel surveys were run
on 2026-07-02 against freshly pulled heads: the five candidates, Pi's first-party
subagent example, and this repo's own runner-subagent substrate. **Decision: build** —
a thin explore fan-out tool over the unchanged `dispatchRunnerSubagent` primitive in
`ts/packages/local/pi-tools`, generalizing thermo-council's worker-pool pattern, with
oh-my-pi and Pi's first-party example as design references. No third-party extension is
adopted or forked.

### Per-candidate rationale against the priorities

Priorities: (1) low maintenance burden, (2) control over prompt engineering and UX,
(3) subsumption of `dispatchRunnerSubagent` + thermo-council as bonus. Speed excluded
by the objective.

- **tintinweb/pi-subagents (v0.13.0, 2026-06-30).** Best third-party capability fit:
  model-invocable `Agent` tool, hard session-level allowlists, Haiku `Explore` default,
  500-char preview + on-disk JSONL + `get_subagent_result`, polished FleetView/widget
  rendering. Fails on both governing priorities: kitchen-sink scope (cron scheduler,
  persistent memory, worktrees, cross-extension RPC, management TUI — the explore core
  is ~2.7k of ~8k LOC), bus factor 1 (~88% of commits), deep in-process coupling to Pi
  internals on an unversioned `>=0.74` floor; and the result contract, preview limits,
  and rendering are code-owned — fork-only. Its stock `Explore` allowlist includes
  `bash`.
- **nicobailon/pi-subagents (v0.32.0, 2026-07-01).** Most feature-complete: subprocess
  (`pi --mode json -p`) architecture matching ours, process-enforced `--tools`
  allowlists, preview/pointer/file-only output modes, JSON-Schema structured output,
  rich per-task rendering. Fails maintenance burden hardest: ~34k LOC opinionated
  delegation framework (chains, intercom bus, acceptance policies, async job tracker,
  worktrees), dev-pinned to Pi 0.74.0, dominant single maintainer at high velocity.
  Tool description and rendering are fork-only; no built-in cheap-explorer default
  (its scout ships with `bash` and `write`).
- **gotgenes/pi-packages pi-subagents (v18.0.1, 2026-06-30).** A hard fork of tintinweb
  aggressively slimmed to a minimal in-process core; culturally closest to this repo
  (990 fake-driven tests, DI seams, ADRs, near-zero type escapes; a programmatic
  `SubagentsService` spawn seam). Disqualifying dynamics: 18 breaking major versions in
  ~5.5 weeks, ~90% solo commits, targets Pi 0.75–0.79.x. Also lacks a single batch
  fan-out call (N background tool calls instead) and any structured result contract —
  both would be net-new work even after adopting/forking.
- **mjakl/pi-subagent (v3.0.0, 2026-06-18).** Cleanest small candidate (~3.1k LOC, zero
  runtime deps), subprocess-based, good per-task rendering, agent `.md` files with
  per-agent/per-call model override. Missing the two pieces most central here: no
  preview + on-disk findings split (full final text lands in parent context) and no
  structured result contract. Couples to Pi by hand-parsing raw CLI argv and
  re-implementing session-path encoding; caps, contract, and rendering hardcoded;
  read-only guarantee does not cover extension-contributed tools; bus factor 1.
- **oh-my-pi in-core task system (head 2026-07-02).** Not adoptable — a hard fork with
  a renamed `@oh-my-pi/*` namespace, Rust/native worktree isolation, and ~5,000
  commits/month. Retained as the primary **design reference**; its `explore` agent is
  exactly the target shape. Borrowable mechanisms identified with file pointers:
  `READ_ONLY_TOOL_NAMES` + `isReadOnlyAgent()` gate (`src/task/index.ts:138-165`),
  5000-char newline-snapped preview + `agent://` pointer + `outputMeta`
  (`src/task/index.ts:1429-1480`, `types.ts:24-27`), frontmatter explorer agent with
  structured `output` schema (`src/prompts/agents/explore.md`), per-task
  `AgentProgress` rows on a spinner tick (`types.ts:348-418`, `render.ts:839`), and
  `Semaphore`/`mapWithConcurrencyLimit` + narrow-bracket provider semaphore
  (`src/task/parallel.ts`, `provider-concurrency.ts`).
- **Pi first-party example (`packages/coding-agent/examples/extensions/subagent/`,
  maintained in-tree).** A copy-me reference, not a package. Demonstrates ~90% of the
  spec with the same subprocess architecture as our substrate: single/parallel/chain
  modes in one `registerTool`, per-agent `--tools` (haiku scout; read-only
  planner/reviewer), bounded 4-way concurrency, 50KB preview with full output in tool
  `details`, live ⏳/✓/✗ streaming via `renderResult`/`onUpdate`. Missing only durable
  on-disk findings. Confirms the extension API surface (registerTool + json mode +
  `--tools`) is additive-stable across 0.73→0.80.
- **Build on the local substrate (chosen).** The survey found the primitive already
  does the hard 90%: hermetic `pi --mode json -p` children with `--tools`/`--no-tools`
  allowlist support (`subagent-process.ts:506-531`), an 8-status result taxonomy,
  SIGTERM→SIGKILL escalation, usage accounting, streaming JSON-event progress, 48k-char
  parent cap with session-file pointer, DI seams, and more test code than source
  (runner-subagents: 4,260 LOC src / 4,888 LOC tests). thermo-council already runs a
  bounded read-only worker pool (`runCouncilSeatsWithConcurrencyLimit`,
  `orchestrator.ts:181-222`, `tools: ["read", …]`) — hardwired as a review command
  rather than a model-invocable tool. Remaining work is a thin orchestration layer:
  fan-out tool schema + pool (~150–250 LOC, primitive unchanged), explorer allowlist
  (~1 line, already plumbed), findings artifact + preview helper (~40–80 LOC), N-row
  live widget generalization of the single-key `widget.ts` (~80–150 LOC), plus an
  explorer agent `.md`.

### Why build wins

- **Maintenance burden:** every adoptable candidate is a bus-factor-one project
  churning fast against unpinned or mismatched Pi versions (0.74–0.79 targets vs our
  0.79.1 workspace pin / 0.80.3 installed CLI). Adopting adds an upstream to track;
  the substrate is already ours, pinned, patched, and fake-tested.
- **Prompt/UX control:** in all four extensions, the exact things this objective wants
  to own — tool description, scout output contract, preview economy, progress
  rendering — are code-owned upstream and fork-only. Forking recovers control but
  re-acquires the maintenance burden (the priced risk in objective.md), and every fork
  base still needs net-new work on fan-out and/or the result contract.
- **Subsumption:** inverted and trivially satisfied — instead of a third party
  subsuming runner-subagents, the explore tool is a consumer of it. Consolidation
  (roadmap item 9) reduces to generalizing thermo-council's pool onto the shared
  orchestration layer, or parking as expected.

## Objective Impact

- Roadmap item 1 (adopt-vs-build spike) is **done**; this update is its evidence. The
  decision is recorded durably as ADR 0023
  (`docs/adr/0023-build-pi-explore-subagents-on-runner-subagent-substrate.md`).
- Open question "Adopt, fork, or build" is **resolved: build**.
- Open question "where the engineered implementation lives" is **resolved:
  `ts/packages/local/pi-tools`** alongside `runner-subagents` (reuses its spawn
  primitive, fakes, and test harness), surfaced via the usual 3-line `.pi/extensions/`
  discovery shim. This is engineered-package platform code from the start; no
  provisional consumer artifact is involved.
- Assumption correction: the Pi SDK scope is `@earendil-works/*` (migrated from
  `@mariozechner/*`); the workspace pins 0.79.1 with a pi-ai patch while the installed
  CLI is 0.80.3. The substrate mediates all Pi SDK surface through `@sdl/pi/runtime/*`,
  so this is a contained seam.
- Constraint discovered for the fan-out tool design: the neutral `@sdl/pi`
  `ToolDefinition` has no `executionMode`/`renderResult`; parallelism must live inside
  the tool's own `execute` (as thermo-council does), with progress via `onUpdate` +
  `ctx.ui.setWidget`.
- The survey-freshness risk in objective.md was borne out: nicobailon released
  2026-07-01 and oh-my-pi had new commits on 2026-07-02; heads were re-pulled before
  evaluation.

## Follow-Ups

- Roadmap items 2–5 (explorer agent definition, fan-out tool, preview+pointer
  plumbing, live N-row rendering) proceed on the runner-subagent substrate with the
  size estimates above; item 2 should adopt oh-my-pi's read-only-allowlist gate and
  structured scout output schema as the reference shape.
- When designing the fan-out tool schema, start from the first-party example's
  single/parallel shapes and tintinweb/oh-my-pi's parent-facing prompt language
  ("maximize parallelism", breadth vocabulary) rather than inventing new phrasing.
- Revisit whether `/investigate` (in-process, PARTIAL parity) migrates onto the explore
  substrate once the fan-out tool exists (existing open question, unchanged).
- Consider generalizing thermo-council onto the new orchestration layer as the
  consolidation assessment (roadmap item 9); park if the generalization does not pay
  for itself.
