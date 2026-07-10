# Candidate Harness Session Contract Proven in a Typed Prototype

## Summary

The throwaway Objective-owned prototype at `references/prototype/` completes the candidate-contract roadmap row without changing package exports or live consumers. It compiles independently and its 12 fake-driven tests exercise:

- one routing text generator over direct inference and a Claude isolated-session factory, including qualified-model validation, consistent empty-output rejection, no silent fallback, and unconditional closure;
- profile-specific factories rather than a shared Harness interface: Claude supports strict single-turn isolated generation and both Claude/Codex support sequential read-only-agent sessions, while Codex rejects the isolated profile explicitly;
- a bounded covariant `TurnResult<TUsage>` that retains Claude's rich usage, keeps Codex usage honestly `null`, and degrades malformed Claude usage to `null` without failing successful output;
- provider-specific parsing from minimally classified process evidence into all seven terminal failure kinds with raw diagnostics;
- a branded full-fidelity execution channel carrying cwd, constructed env, stdin, `AbortSignal`, finite default/per-turn timeout, structured schema, startup error, and raw exit evidence;
- eager resource acquisition, exactly-once nonthrowing best-effort cleanup, structured transport parsing, and session-local read-only history with persistence disabled.

The adjacent interface-depth notes compare the candidate seams with the duplicate kernel/capability-kit `TextGenerator` contracts, `PiTextGenerator`, the orphaned Pi fast-draft launcher, Reviews' duplicated harness runners, and the narrowed ns execution channel. They reject a shared Harness marker, generic subprocess wrapper, provider-specific TextGenerator subclasses, one optional profile bag, capability discovery, and flattened usage as shallow layers.

## Objective Impact

- The prototype roadmap row is complete. The candidate domain model is coherent enough to proceed to the human placement, curated-surface, and migration-stack decision.
- The honest shared result and `runTurn()` sufficiency assumptions are validated at prototype level rather than design level only.
- The lowest-common-denominator result risk and shallow-session-machinery risk are de-risked at interface level. Real Claude/Codex adapters and consumer migrations still need conformance evidence before those risks are fully retired.
- Package placement remains deliberately unsettled. The prototype stays outside the pnpm workspace and exports maps and carries an explicit promotion/disposal path in its README.

## Follow-Ups

- Grill and settle package ownership, curated exports, and independently valid migration slices using the prototype and importer evidence.
- During crystallization, preserve real-adapter conformance work for CLI envelopes, isolation/version drift, timeout/cancellation behavior, authentication diagnostics, and cleanup.
- Rewrite production code against real command adapters after placement is settled; do not import the Objective-owned prototype into production packages.
