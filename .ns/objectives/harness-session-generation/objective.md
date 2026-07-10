# Harness Sessions and Unified Text Generation

## Thesis

The Destination is one coherent text-generation and local-harness architecture that preserves harness-managed authentication without making callers depend on subprocess mechanics. Concrete harnesses such as Claude Code and Codex create constrained sessions; a session owns lifecycle and exposes `runTurn()` as the primitive operation; common text generation composes that primitive in an isolated, single-turn profile. The text-generation module composes execution behavior rather than growing provider- or harness-specific subclasses.

The design is proven only when both direct model inference and harness-backed inference fit the unified text-generation contract, Pi fast draft uses isolated authenticated harness generation as the first steelthread, and Reviews uses the same harness/session foundation for repository-aware read-only execution without losing qualified model routing, structured findings, coverage, or cleanup behavior.

## Scope

- Define the domain language and interfaces for a concrete Harness, constrained Harness Session profiles, turns, terminal results, lifecycle, and common text generation.
- Unify direct model inference and harness-backed generation through composition while keeping transport, authentication, and subprocess details behind their owning implementations.
- Specify and enforce an isolated-generation profile: fresh single-turn execution, harness-managed credentials, no ambient project or user behavioral context, no tools, no skills, no persistent history, and unconditional cleanup.
- Specify the bounded read-only-agent profile Reviews needs (settled name for what earlier drafts called "workspace-agent"): explicit repository working directory, read-only execution, structured output, cancellation, and harness-specific translation behind the common session seam.
- Make common text generation a convenience interaction over session creation, constrained `runTurn()`, result draining, empty-output handling, and closure; callers needing richer behavior use the session interface directly.
- Prove the design first through Pi fast draft using Claude Code authentication, then through Claude/Codex Reviews migration.
- Decide package placement and curated exports only after the two consumers establish a real shared seam.

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
- Reviews is migrated as the second consumer and retains qualified model references, provider-correct routing, prompt and input-coverage behavior, read-only repository access, structured findings, progress/results/log identity, and silent best-effort cleanup semantics.
- Package placement and curated exports follow the repo's second-consumer and subpackage rules, with no broad-root implementation leak.
- The final architecture and migration behavior are documented sufficiently for another capability to choose direct inference, isolated harness generation, or a workspace-agent session without learning provider CLI details.

## Definition of Progress

Progress is keepable when:

- It advances an open roadmap row as one coherent slice: a source-backed decision dossier or design document for a grilling row, the throwaway typed prototype exercising the candidate contract, documentation, or — after the crystallization row replaces the Frontier — an implementation slice with passing tests.
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

This Objective is execution-friendly for `objective-next` and a valid target for repeated Objective Runner steps under the boundaries below. Its current phase is design-heavy: runner steps prepare decisions and evidence; humans settle them.

- Direct execution is allowed when: the slice advances an open, unblocked roadmap row within scope — research and probe work, decision dossiers for the grilling rows, the throwaway prototype in a clearly non-exported location, documentation — or, after crystallization, an implementation row inside the packages the placement decision names, completing with passing validation.
- Steer or ask first when: settling any grilling-row or Fog decision (domain model, session ownership, turn contract, text-generation composition, structured-output split, package placement, curated exports, migration staging); changing live consumer behavior or public surfaces; widening `NsExecOptions` or the kernel exec contract; or marking a grilling row done — dossiers inform decisions, they do not make them.
- How work may change files and be left: local repository edits only, committed per slice on the working branch (never `main`/`master`); each runner step leaves a clean tree; Objective tracking goes through `objective-update` between steps, never inside one.
- Validation before keeping work: `just` repo validation plus tests for touched packages; formatting failures fixed via `just dprint-fix` and the TS autofixers, not by hand.
- What will not happen unless explicitly requested: pushing, PR creation or submission, publishing, deleting `draftWithFastText` or editing exports maps before the migration decision, harness invocations beyond read-only local CLI probes, or any external write-capable action.

## Assumptions and Risks

### Assumptions

- Claude Code and Codex can preserve their native login state while suppressing enough user and project behavioral configuration to satisfy an isolated-generation contract. **Validated with caveats** by the isolated-generation research (`docs/research/claude-codex-isolated-generation-guarantees.md`): Claude Code satisfies the full contract via flags (`--safe-mode` and companions, native OAuth intact); Codex satisfies the login-preserving core via `--ephemeral --ignore-user-config` but cannot enforce no-tools, no ambient user skills, no global `$CODEX_HOME/AGENTS.md`, or system-prompt replacement by flags — those become explicit capability rejections or preflight failures, exactly as the contract's fail-explicitly rule anticipated.
- Direct inference and isolated harness inference share an honest text-generation result contract even though authentication, process lifecycle, and native metadata differ. **Validated at prototype level** by `references/prototype/`: one routing `TextGenerator` composes both paths, rejects empty output consistently, preserves token-core usage while retaining Claude's richer native record, and widens Claude/Codex read-only sessions through covariant `TurnResult<TUsage>` without provider branches in callers. Production adapters still have to prove the same behavior against real CLIs.
- `runTurn()` is a sufficiently small primitive for both isolated generation and Reviews' bounded repository-aware execution without requiring persistent session machinery. **Validated at prototype level**: one single-turn isolated profile and sequential read-only-agent sessions cover text, structured output, cancellation, timeout overrides, session-local non-persistent history, raw failure translation, and cleanup without adding per-turn profile options.
- Fast draft and Reviews are two materially distinct consumers that justify promotion into shared capability-building infrastructure. **Revised** by the consumer inventory (`docs/research/harness-consumer-semantics-inventory.md`): `draftWithFastText` itself has zero production call sites (its callers migrated to the kernel `TextGenerator`; it is not in the pi exports map), so the fast-draft steelthread concretely means serving the live `TextGenerator`-based flows through isolated harness generation and deleting the orphaned module. The two-distinct-consumers justification stands — direct-inference `TextGenerator` consumers and Reviews — but the first consumer is the `TextGenerator` contract, not the orphaned module.

### Risks

- A harness CLI may not be able to disable all ambient tools or intrinsic coding-agent context, making “pure inference” weaker than its name implies. The contract must describe enforceable guarantees and reject unsupported profiles. **Materialized for Codex** (research, 0.136.0): the intrinsic 15-tool set is containable (`--sandbox read-only`) but not removable, and `$HOME/.agents/skills` has no off switch; Claude Code can enforce true zero-tool, zero-skill requests. The rejection-based contract shape is confirmed as necessary, not hypothetical.
- Authentication and behavioral configuration may share native files or startup paths; suppressing one could accidentally suppress the other or leak user behavior into supposedly isolated generation. **De-risked with specifics** (research): Claude Code `--bare` and config-root redirection (`CLAUDE_CONFIG_DIR`, fresh `CODEX_HOME`) all break native login explicitly; the login-preserving splitters are `--safe-mode` + `--setting-sources ""` (Claude Code) and `--ignore-user-config` (Codex), with a probe-confirmed fresh-`CODEX_HOME`-plus-`auth.json`-symlink construction as Codex's maximal fallback. All observed failure modes were explicit (non-zero exit plus diagnostic), never silent degradation.
- A lowest-common-denominator result could discard Claude usage data, Codex diagnostics, structured output fidelity, or cancellation distinctions. **De-risked at prototype level**: the bounded-generic result preserves Claude's richer usage and Codex's honest `null`; structured schemas reach the transport seam; malformed usage degrades to `null`; and minimally classified provider evidence maps to seven failures with raw diagnostics. Production conformance still has to pin real CLI envelopes and drift.
- Session and profile machinery could become shallower and more complex than the duplicated launchers it replaces. **De-risked at interface level** by the prototype comparison: profile-specific factories and one small session interface absorb acquisition, execution translation, parsing, lifecycle, history, and cleanup, while a shared Harness marker, generic subprocess wrapper, provider-specific TextGenerator subclasses, capability discovery, and an optional-bag profile interface are rejected as shallow. The remaining deletion/caller-simplification proof must come from the live `TextGenerator` and Reviews migrations.
- The `ns`-hosted command execution channel silently narrows the contract the redesign depends on: `NsCommandExecApi` drops per-call env and AbortSignal and refuses any cwd other than the context cwd, and the kernel `ctx.exec` drops `startupError` (consumer inventory §5). Harness sessions running under `NsExtensionApi.exec` inherit these losses; the design must either widen `NsExecOptions` or route harness execution around it, and cancellation today is a blank slate on every layer (declared review cancellation codes have no producers; no AbortSignal test exists anywhere). **Decided** (grilling, update 2026-07-10): route around — session factories demand a branded full-fidelity channel and ns hosts wire `NodeCommandExecApi` at construction; widening `NsExecOptions` is out of this objective's scope. Cancellation is defined fresh as the first-class `cancelled` turn-failure kind.
- Migrating Reviews could unintentionally change review quality, read-only guarantees, model identity, or observable failure behavior. **Two changes are now intentional, not accidental** (grilling, update 2026-07-10): dropping `--bare`/implicit-API-key in favor of caller-agnostic harness-native auth, and adding a finite turn timeout where today a hung CLI runs forever. The argv-pinning tests get rewritten deliberately for these; everything else stays PRESERVE.
- Premature package promotion could expose unstable runtime concepts before the second consumer proves the seam.

## Open Questions

### Fog

- The eventual package and subpackage names should remain unset until the interface depth and importer classes are known.

Formerly foggy, resolved by the settled domain model (`updates/2026-07-10-domain-model-and-composition-settled.md`): streaming (turn results are terminal-only in this contract revision; event exposure is a future extension), structured-output ownership (transport parse in the session, consumer-semantic Zod validation above the seam), and capability discovery (none — unsupported profiles are explicit factory failures).
