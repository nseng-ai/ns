# Roadmap

## Work

- [x] **Research — Establish enforceable isolated-generation behavior for Claude Code and Codex.** Determine, from pinned CLI behavior and primary documentation/source, which settings preserve native login while suppressing project instructions, user behavioral configuration, tools, skills, MCP, history, and repository context; identify any guarantee each harness cannot enforce. **Blocked by:** none. **Evidence:** source-backed guarantee matrix with probe results in `docs/research/claude-codex-isolated-generation-guarantees.md` (pinned to Claude Code 2.1.206 and Codex 0.136.0). Claude Code isolates fully via `--safe-mode` plus companion flags with native OAuth preserved (`--bare` breaks native login and is disqualified). Codex isolates via `--ephemeral --ignore-user-config` plus `-c` overrides, but four guarantees are unenforceable by flags — no-tools, no ambient `$HOME/.agents/skills`, no global `$CODEX_HOME/AGENTS.md`, and true system-prompt replacement — and must be explicit capability rejections or LBYL preflight failures. Every auth-breaking configuration probed failed explicitly, so the fail-explicitly design rule is implementable as-is.

- [ ] **Grilling — Settle the Harness, Session, profile, and turn domain model.** Decide where model selection and execution context live, what a session owns, the exact lifecycle, how `runTurn()` represents one turn, and which constraints are fixed at session creation rather than selectable per call. Preserve the settled direction that concrete harnesses create constrained sessions and `runTurn()` is the primitive. **Blocked by:** none.
  - Policy: decisions settle with the human; a runner step may prepare the decision dossier (options, consequences, recommendation per question, cited to the two research artifacts) but must not settle the contract or mark this row done.

- [ ] **Grilling — Settle unified text-generation composition.** Decide the composed dependency beneath the text-generation module, how direct inference and harness-backed inference fit it without TextGenerator subclasses, and the exact common convenience interaction that creates an isolated session, runs one turn, drains text, rejects empty output, and closes. **Blocked by:** none.
  - Policy: same as the domain-model grilling row — dossier preparation is runnable; the decision is not.

- [x] **Research — Inventory consumer semantics and migration invariants.** Record the exact current behavior of Pi fast draft, Reviews Claude/Codex execution, the direct Pi model generator, command execution channels, authentication assumptions, structured output, usage, cancellation, cleanup, and public surfaces that the redesign must preserve or intentionally change. **Blocked by:** none. **Evidence:** per-consumer inventory with a PRESERVE / CHANGE? / UNDEFINED migration-invariants table in `docs/research/harness-consumer-semantics-inventory.md` (every claim cited `path:line`; pinning tests named per invariant). Key facts: four distinct text-generation surfaces exist (two are structural duplicates of one contract); `draftWithFastText` has zero production call sites and is not in the pi exports map, so steelthread deletion is cheap and the live fast-text consumers are the kernel `TextGenerator` flows; the Reviews runners' argv, parse taxonomy, cleanup ordering, and usage handling are hard-pinned by fake-driven tests; cancellation is a blank slate (declared codes with no producers, no AbortSignal test anywhere); the `ns`-hosted exec channel silently drops env/signal/startupError and locks cwd.

- [ ] **Prototype — Exercise the candidate contract with fake Claude and Codex harnesses.** Build a throwaway typed prototype that demonstrates direct inference composition, isolated harness generation, a read-only workspace turn, terminal-result draining, failure mapping, and cleanup without optionality leakage or provider-specific caller branches. Use it to compare interface depth and reject shallow layers. **Blocked by:** “Establish enforceable isolated-generation behavior for Claude Code and Codex,” “Settle the Harness, Session, profile, and turn domain model,” “Settle unified text-generation composition,” and “Inventory consumer semantics and migration invariants.”
  - Policy: direct execution once its blockers clear; keep the prototype throwaway — outside package public surfaces and exports maps.
  - Evidence: a typed prototype with fake Claude and Codex harnesses that compiles and runs its own tests, plus interface-depth comparison notes.

- [ ] **Grilling — Decide placement, curated surfaces, and the migration stack.** Using prototype and importer evidence, decide whether the implementation belongs in capability-kit or another existing package, which interfaces are public, and how to stage fast draft first and Reviews second as independently valid PRs. **Blocked by:** “Exercise the candidate contract with fake Claude and Codex harnesses.”
  - Policy: decisions settle with the human; a runner step may assemble the importer/prototype evidence but must not decide placement, exports, or staging.

- [ ] **Task — Crystallize the resolved design into execution-ready roadmap slices.** Replace the emptied Frontier with implementation work for the shared contract, Claude/Codex conformance, fast-draft steelthread, Reviews migration, documentation, and final compatibility evidence; preserve unresolved newly visible questions as new Question Rows rather than guessing. **Blocked by:** “Decide placement, curated surfaces, and the migration stack.”
  - Policy: parent tracking work through `objective-update` between steps, not a runner subagent step; the implementation rows it produces should be runner-sized with row-level evidence.

## Parked

- Persistent and resumable harness sessions.
- Streaming and interactive turn-control features not required by fast draft or Reviews.
- Remote sandbox-provider integration.
- General tools, MCP, skills, and approval orchestration.
- Vibechk and other edit-capable harness launcher migrations.
- Additional harness/provider registry and capability-discovery machinery.
