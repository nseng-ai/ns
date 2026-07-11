# Consumer Semantics and Migration Invariants Inventoried

## Summary

The "Research — Inventory consumer semantics and migration invariants" roadmap row is complete. The evidence is `docs/research/harness-consumer-semantics-inventory.md`: a read-only, `path:line`-cited inventory of the four consumers the redesign must migrate (Pi fast draft, Reviews Claude execution, Reviews Codex execution, direct Pi model generation) plus the command execution channels, ending in a per-behavior PRESERVE / CHANGE? / UNDEFINED migration-invariants table that names the pinning test for each preserved behavior.

Load-bearing findings:

- **`draftWithFastText` has zero production call sites.** Its historical callers (`/cp`, `/changes`) migrated to the kernel `TextGenerator` (commits `dd48b9d20`, `5c1bf8fb2`), and the module is not in the `@nseng-ai/pi` exports map. The steelthread's deletion evidence is cheap; the live fast-text consumers to serve are the `TextGenerator`-based flows, whose selection helpers still honor legacy `PI_DRAFT_MODEL` for `/changes` (scenario-test pinned).
- **Four distinct text-generation surfaces exist**, two of which (`@nseng-ai/kernel/sdk` `TextGenerator` and `@nseng-ai/capability-kit/text-generation`) are structural duplicates of the same contract; `callPiModelText` and the Reviews harness-runner seam are the others. Consolidation maps directly onto the deferred package-placement roadmap row.
- **The Reviews runners' compatibility contract is their fake-driven tests**: exact Claude argv including `--bare`, full Codex argv, stdin conventions, parse taxonomies, Codex `usage: null` vs Claude 7-field usage, and best-effort cleanup ordering are all hard-pinned. Qualified-ref routing is closed and identity-preserving (only modelId crosses to the harness; the full reference is retained in progress/results/logs).
- **Cancellation is a blank slate, not a compatibility constraint.** `review-execution-cancelled`/`review-execution-blocked` are declared but produced nowhere; an abort surfaces today as `harness-invocation-failed` via `startupError`; no test at any layer exercises AbortSignal.
- **The `ns`-hosted exec channel silently narrows the contract**: `NsCommandExecApi` drops env and signal and locks cwd, and kernel `ctx.exec` drops `startupError`. Sessions running under `NsExtensionApi.exec` inherit these losses.
- **Auth preconditions are enforced nowhere**: the Reviews Claude runner's `ANTHROPIC_API_KEY` requirement (a consequence of `--bare`, per the isolation-guarantees research) is implicit; a missing key is a generic harness failure rather than an explicit precondition failure.

## Objective Impact

- Roadmap row marked `[x]` with the artifact as evidence. The prototype row is now blocked only by the two grilling rows (Harness/Session/profile/turn domain model; unified text-generation composition).
- The two-distinct-consumers assumption is revised in `objective.md`: the first steelthread consumer is concretely the `TextGenerator` contract, not the orphaned `draftWithFastText` module; the deletion half of the shallow-machinery risk is partially de-risked because the module is already orphaned.
- A new risk is recorded: the `ns`-hosted exec channel's silent narrowing (env/signal/startupError/cwd) plus the cancellation blank slate — the session contract must decide cancellation and channel-widening explicitly rather than inheriting behavior.
- Both grilling rows now have their evidence base in place: the isolation-guarantees matrix (what harnesses can enforce) and this inventory (what consumers require and which behaviors are test-pinned versus free to change).

## Follow-Ups

- Decision-needed items flagged (not decided) in the inventory, to resolve in the grilling rows: the Reviews Claude `--bare`/API-key auth coupling versus harness-native login; one honest usage story across Claude's rich usage, Codex's `null`, and `callPiModelText`'s dropped usage; whether `PI_DRAFT_HARNESS` survives as a knob; harness-run timeouts (Reviews currently has none); widening `NsExecOptions` versus routing around it.
- Contract gaps to cover with tests during implementation: `PiTextGenerator` has zero direct tests; both fast-draft execution paths are untested; AbortSignal is untested at every layer; Claude-side env/signal threading in Reviews is untested (Codex side is pinned).
