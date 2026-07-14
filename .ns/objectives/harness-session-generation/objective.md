---
edges:
  - objective: cloud-execution
    annotation: Boundary agreement — this record owns the local harness-session/text-generation contract and stays free of remote-sandbox and vendor coupling; cloud-execution consumes harnesses in sandboxes only behind its own cloud backend seam (AI SDK harness adapters), never through this session contract.
---

# Harness Sessions and Unified Text Generation

## Thesis

The Destination is one coherent text-generation and local-harness architecture that preserves harness-managed authentication without making callers depend on subprocess mechanics. Concrete harnesses such as Claude Code and Codex create constrained sessions; a session owns lifecycle and exposes `runTurn()` as the primitive operation; common text generation composes that primitive in an isolated, single-turn profile. The text-generation module composes execution behavior rather than growing provider- or harness-specific subclasses.

The design is proven only when both direct model inference and harness-backed inference fit the unified text-generation contract, Pi fast draft uses isolated authenticated harness generation as the first steelthread, and Reviews uses the same harness/session foundation for repository-aware read-only execution without losing qualified model routing, structured findings, coverage, or cleanup behavior.

## Scope

- Define the domain language and interfaces for a concrete Harness, constrained Harness Session profiles, turns, terminal results, lifecycle, and common text generation.
- Unify direct model inference and harness-backed generation through composition while keeping transport, authentication, and subprocess details behind their owning implementations.
- Specify and enforce an isolated-generation profile: fresh single-turn execution, harness-managed credentials, no ambient project or user behavioral context, no tools, no skills, no persistent history, and unconditional cleanup.
- Specify the bounded `reading-agent` profile Reviews needs: explicit repository working directory, repository-reading intent, advisory non-mutation, structured output, cancellation, finite timeout, and harness-specific translation behind the common session seam. Stronger containment such as Codex's read-only sandbox is an implementation guarantee, not a weaker/stronger per-call profile option.
- Make common text generation a convenience interaction over session creation, constrained `runTurn()`, result draining, empty-output handling, and closure; callers needing richer behavior use the session interface directly.
- Prove the design first through Pi fast draft using Claude Code authentication, then through Claude/Codex Reviews migration.
- Place the cohesive harness capability in foundation: a curated public harness-session API, a private parameterized single-turn engine, and concrete Claude/Codex profile adapters. Foundation's exec substrate owns truthful process termination.

## Non-Goals

- Remote sandbox providers or coupling the session contract to Vercel Sandbox.
- Persistent, resumable, detachable, or cross-process sessions.
- Interactive approval UI, MCP integration, or a general tool registry.
- Migrating Vibechk, interactive handoffs, runner subagents, or every existing subprocess launcher.
- Reproducing Vercel AI SDK Harness APIs wholesale or depending on its experimental harness package.
- Encoding Reviews' provider-to-harness routing policy as global platform truth.
- Making one optional-bag interface where tools, permissions, working directories, persistence, and generation semantics can be mixed per call.

## Completion Criteria

- The Frontier has crystallized: the Harness, Harness Session, session-profile, turn, text-generation composition, failure, usage, and lifecycle contracts have no unresolved design questions needed for implementation.
- A unified text-generation module composes direct model and harness-backed execution without provider- or harness-specific TextGenerator subclasses.
- At least Claude Code and Codex satisfy the relevant harness/session contracts through caller-supplied command execution channels, with conformance coverage for supported profiles.
- Isolated harness generation demonstrably preserves native harness authentication while suppressing ambient behavioral configuration, repository context, tools, skills, and history; unsupported guarantees fail explicitly rather than degrading silently.
- Pi fast draft is migrated as the first steelthread and obtains ordinary text through the common isolated-generation interaction without owning Claude subprocess or temporary-file mechanics.
- Reviews is migrated as the second consumer and retains qualified model references, provider-correct routing, prompt and input-coverage behavior, repository-reading behavior with advisory non-mutation, structured findings, progress/results/log identity, and silent best-effort cleanup semantics; harness-specific stronger containment remains enabled where available.
- Foundation publicly owns harness-session semantics through a curated API surface; the parameterized engine remains private to the harness feature, and concrete supported factories omit statically impossible profiles.
- Foundation command execution returns a required discriminated termination union for ordinary exit, spawn failure, caller cancellation, and timeout; legacy ambiguous `killed`/optional-`startupError` semantics are removed and callers migrate atomically.
- The final architecture and migration behavior are documented sufficiently for another capability to choose direct inference, isolated harness generation, or a reading-agent session without learning provider CLI details.

## Definition of Progress

Progress is keepable when:

- It advances an open roadmap row as one coherent slice. The research, grilling, and prototype rows are complete and the Frontier has crystallized, so keepable progress now means an implementation slice with passing tests, or documentation, for an open row.
- It preserves the settled direction: concrete harnesses create constrained sessions, `runTurn()` is the primitive, text generation composes execution behavior rather than growing TextGenerator subclasses, and unsupported guarantees fail explicitly rather than degrading silently.
- It honors the migration-invariants table in `docs/research/harness-consumer-semantics-inventory.md`: PRESERVE behaviors stay pinned by their named tests unless a Semantic Update records an intentional change.

Do not keep changes that:

- Cross a non-goal: optional-bag interfaces mixing generation semantics per call, persistent/resumable sessions, remote sandbox coupling, MCP or tool-registry machinery, or wholesale Vercel Harness API reproduction.
- Change the behavior, public exports, or test-pinned contracts of live consumers (Reviews runners, the kernel `TextGenerator` flows, `callPiModelText`, `NsCommandExecApi`) before the placement and migration-stack decisions are settled.
- Present prototype code as production capability — the prototype stays throwaway, outside package public surfaces and the exports maps.
- Break `just` repo validation or existing package tests.

Useful evidence includes:

- Decision dossiers citing the two research artifacts by `path:line`, with options, consequences, and a recommendation per open question.
- A typed prototype with fake Claude and Codex harnesses that compiles, runs its own tests, and yields interface-depth comparison notes against the duplicated launchers it would replace.
- Probe transcripts against pinned CLI versions (Claude Code 2.1.206, Codex 0.136.0) when a guarantee claim needs re-verification.

## Runner Policy

This Objective is execution-friendly for `objective-next` and a valid target for repeated Objective Runner steps under the boundaries below. The design phase is settled — no design question blocks implementation — and the remaining roadmap rows are implementation slices; the first (the foundation exec termination union) landed via PR #3373.

- Direct execution is allowed when: the slice advances one open implementation row within its stated evidence and compatibility boundaries, including the foundation harness API/private engine/adapters, unified text-generation steelthread, provider-by-provider Reviews migration, or final cleanup/documentation (the foundation exec migration row already landed via PR #3373).
- Steer or ask first when: changing the settled `reading-agent` advisory guarantee, reintroducing multi-turn sessions, changing the non-generic output union or seven-kind-plus-stage failure contract, moving harness ownership out of foundation, exposing the private adapter hooks, widening `NsExecOptions`, changing intentional migration invariants beyond the two already accepted Reviews changes, or broadening a row across independently valid stack slices.
- How work may change files and be left: local repository edits only, committed per slice on the working branch (never `main`/`master`); each runner step leaves a clean tree; Objective tracking goes through `objective-update` between steps, never inside one.
- Validation before keeping work: `just` repo validation plus tests for touched packages; formatting failures fixed via `just dprint-fix` and the TS autofixers, not by hand.
- What will not happen unless explicitly requested: pushing, PR creation or submission, publishing, deleting `draftWithFastText` or editing exports maps before the migration decision, harness invocations beyond read-only local CLI probes, or any external write-capable action.

## Assumptions and Risks

### Assumptions

- Claude Code and Codex can preserve their native login state while suppressing enough user and project behavioral configuration to satisfy an isolated-generation contract. **Validated with caveats** by the isolated-generation research (`docs/research/claude-codex-isolated-generation-guarantees.md`): Claude Code satisfies the full contract via flags (`--safe-mode` and companions, native OAuth intact); Codex satisfies the login-preserving core via `--ephemeral --ignore-user-config` but cannot enforce no-tools, no ambient user skills, no global `$CODEX_HOME/AGENTS.md`, or system-prompt replacement by flags — those become explicit capability rejections or preflight failures, exactly as the contract's fail-explicitly rule anticipated.
- Direct inference and isolated harness inference share an honest text-generation result contract even though authentication, process lifecycle, and native metadata differ. **Validated only as type composition** by `references/prototype/`: one routing module can compose both paths, reject empty output consistently, and preserve token-core usage while retaining provider-native detail without provider branches in callers. The prototype duplicates and subtly narrows the live `TextGenerator` contract, so production compatibility and canonical ownership remain open for the placement decision.
- `runTurn()` is a sufficiently small primitive for isolated generation and Reviews' bounded repository-aware execution without persistent cross-process machinery. **Settled after prototype critique**: both initial profiles are single-turn; a second turn is profile misuse. Multi-turn, transcript replay, native continuation, concurrent turns, and close-during-active-turn semantics remain parked until a real consumer justifies a new profile.
- Fast draft and Reviews are two materially distinct consumers that justify promotion into shared capability-building infrastructure. **Revised** by the consumer inventory (`docs/research/harness-consumer-semantics-inventory.md`): `draftWithFastText` itself has zero production call sites (its callers migrated to the kernel `TextGenerator`; it is not in the pi exports map), so the fast-draft steelthread concretely means serving the live `TextGenerator`-based flows through isolated harness generation and deleting the orphaned module. The two-distinct-consumers justification stands — direct-inference `TextGenerator` consumers and Reviews — but the first consumer is the `TextGenerator` contract, not the orphaned module.

### Risks

- A harness CLI may not be able to disable all ambient tools or intrinsic coding-agent context, making “pure inference” weaker than its name implies. The contract must describe enforceable guarantees and reject unsupported profiles. **Materialized for Codex** (research, 0.136.0): the intrinsic 15-tool set is containable (`--sandbox read-only`) but not removable, and `$HOME/.agents/skills` has no off switch; Claude Code can enforce true zero-tool, zero-skill requests. The rejection-based contract shape is confirmed as necessary, not hypothetical.
- Authentication and behavioral configuration may share native files or startup paths; suppressing one could accidentally suppress the other or leak user behavior into supposedly isolated generation. **De-risked with specifics** (research): Claude Code `--bare` and config-root redirection (`CLAUDE_CONFIG_DIR`, fresh `CODEX_HOME`) all break native login explicitly; the login-preserving splitters are `--safe-mode` + `--setting-sources ""` (Claude Code) and `--ignore-user-config` (Codex), with a probe-confirmed fresh-`CODEX_HOME`-plus-`auth.json`-symlink construction as Codex's maximal fallback. All observed failure modes were explicit (non-zero exit plus diagnostic), never silent degradation.
- A lowest-common-denominator result could discard Claude usage data, Codex diagnostics, structured output fidelity, cancellation distinctions, or Reviews' pinned parse taxonomy. **Contract settled; implementation risk remains**: `TurnResult<TUsage>` uses a non-generic discriminated text/structured output union, bounded provider usage, seven common failure kinds, typed stage/cause, and raw diagnostics. Consumer-semantic invalid-findings remains above transport parsing; convenience text generation may narrow failures to its existing string contract.
- Session and profile machinery could become shallower and more complex than the duplicated launchers it replaces. **Placement and depth settled**: foundation publicly owns the cohesive harness capability; its private parameterized engine owns eager acquisition, one-turn enforcement, positive finite timeout validation, total exception normalization, idempotent close, and exactly-once best-effort release. Concrete profile adapters own real argv/env/auth/resources/wire parsing and failure mapping. The hook interface is not exported.
- Claude Code does not need to match Codex's sandbox to implement the common profile. **Accepted product semantics**: `reading-agent` names repository-reading intent and advisory non-mutation, not universal OS-level containment. Codex retains stronger sandbox enforcement; Claude's available containment is documented honestly.
- The real command channel could not distinguish timeout from caller cancellation. **Retired — breaking migration landed** (PR #3373, merged 2026-07-11, commit `d1deb4227`): foundation `ExecResult` is now the exhaustive discriminated union for exited, spawn-failed, cancelled, and timed-out outcomes, the Node adapter is authoritative for cause, callers migrated atomically with no legacy compatibility fields, and `NsExecOptions` was not widened.
- Routing harness execution around `ctx.exec` could accidentally change unrelated Reviews gateways if wiring replaces the shared exec object wholesale. Reviews needs a distinct harness-exec dependency while git, logs, and other gateways retain their existing channels.
- Binary resolution from ambient `PATH` can undermine an allowlist-constructed child environment if resolution and execution use different environment assumptions; executable resolution must be owned coherently with isolation.
- The `ns`-hosted command channel remains too narrow for harness execution: it drops per-call env and AbortSignal and locks cwd. **Wiring settled**: the foundation harness feature consumes a private narrowed gateway over foundation's Node execution substrate; ns hosts construct that dependency directly. Reviews adds a distinct harness-exec dependency rather than replacing the existing shared channel used by git, logs, and unrelated gateways. `NsExecOptions` remains unchanged.
- Migrating Reviews could unintentionally change review quality, read-only guarantees, model identity, or observable failure behavior. **Two changes are now intentional, not accidental** (grilling, update 2026-07-10): dropping `--bare`/implicit-API-key in favor of caller-agnostic harness-native auth, and adding a finite turn timeout where today a hung CLI runs forever. The argv-pinning tests get rewritten deliberately for these; everything else stays PRESERVE.
- Foundation ownership is intentionally broader than neutral process infrastructure: it becomes publicly responsible for harness-session semantics because both kernel text generation and Reviews consume the capability. The public API must remain curated; lifecycle adapter hooks and provider mechanics remain private so foundation does not expose a generic orchestration framework.

## Open Questions

No design question blocks implementation. Exact private hook signatures and typed failure-stage vocabulary may be refined inside their implementation slices without changing the settled public contract.

Settled after prototype critique: the profile is `reading-agent` with advisory non-mutation; initial sessions are single-turn; output is a non-generic discriminated union with usage as the only generic; statically unsupported factories are absent; seven common failure kinds retain typed stage/cause and raw diagnostics; foundation exec uses a breaking discriminated termination union; foundation publicly owns the cohesive harness capability while its parameterized engine remains private; and migration proceeds substrate-first.
