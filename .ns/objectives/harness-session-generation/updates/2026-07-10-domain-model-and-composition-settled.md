# Domain Model and Text-Generation Composition Settled

## Summary

Both grilling rows were settled in an interactive grilling session with the human, decision by decision, grounded in the two research artifacts (`docs/research/claude-codex-isolated-generation-guarantees.md`, `docs/research/harness-consumer-semantics-inventory.md`). The settled design:

### Harness, Session, profile, turn

- **Harness is a domain term, not a type.** No shared Harness interface and no capability discovery. The typed contracts are per-profile session contracts; each concrete harness module (claude-code, codex) exports typed factories for the profiles it supports; an unsupported profile is an explicit factory failure. Consumers wire concrete factories (Reviews keeps its closed provider→harness switch).
- **Profiles are fixed guarantee sets, never parameterized.** New needs get new named profiles. Two profiles now:
  - **isolated-generation** (`IsolatedGenerationSession`): fresh temp cwd, constructed env allowlist, no tools/skills/ambient config/history, unconditional cleanup. Strict — Claude Code supports it; Codex does not (explicit rejection; its unenforceable guarantees disqualify it rather than weakening the profile). Single-turn by profile definition.
  - **read-only-agent** (`ReadOnlyAgentSession`, renaming the objective's earlier "workspace-agent" wording — "workspace" collides with the pnpm workspace and names no guarantee): explicit repository cwd as a creation parameter, read-only execution, tools contained, structured output, cancellation. Both harnesses support it.
- **Base session contract is sequential multi-turn**; the isolated profile pins exactly one `runTurn()` (continuation requires the recorded session state the profile forbids). A second turn on an isolated session is an explicit profile-violation error.
- **Identity at creation, content per turn.** Creation fixes profile, model, system prompt, output mode (text | structured+schema), cwd/env, exec channel, default timeout. `runTurn()` takes only user input, optional `AbortSignal`, optional timeout override.
- **Eager async creation, idempotent close.** The factory does preflight and resource acquisition and fails explicitly there — a held session can run. `close()` is required, idempotent, never throws (silent best-effort cleanup, preserving Reviews' pinned semantics); the text-gen convenience closes in `finally`.
- **Exec channel: brand + route around.** Session factories demand a branded full-fidelity channel (env, signal, stdin, `startupError`, free cwd). ns-hosted consumers wire `NodeCommandExecApi` at construction instead of `ctx.exec`; widening `NsExecOptions` is deliberately out of this objective's scope. (The isolated profile is structurally impossible over the ns channel: it cannot own env construction and its fresh-cwd guarantee is refused by the cwd lock.)
- **Auth is the harness's business; callers are agnostic.** No auth options anywhere in the contract. The env allowlist passes the harness's full native auth surface (HOME/keychain/auth.json plus ambient provider API keys when present); the harness's own precedence chain decides, matching what a human running the CLI in that environment would get. Auth problems are runtime `auth-failed` results carrying the CLI's explicit diagnostics.
- **Turn result: discriminated union with seven failure kinds** — `invocation-failed`, `auth-failed`, `execution-failed`, `cancelled`, `timed-out`, `empty-output`, `invalid-output` — each carrying raw diagnostics (exit code, stderr). Cancellation and timeout are first-class, giving Reviews' declared-but-unproduced cancellation codes a producer. Consumer-semantic validation (e.g. Reviews' findings Zod schema) stays above the seam.
- **Success payload by creation mode**: text-mode ok-results carry `text: string`; structured-mode carry transport-parsed `value: JsonValue`. No payload generic.
- **Usage is generic with a common-core bound**: `TurnResult<TUsage>` where `TUsage extends { inputTokens: number; outputTokens: number } | null`. Claude keeps its full native record (7 fields incl. cost/duration/cache), Codex instantiates `null`, direct inference its 2-field shape. `TUsage` is output-position-only, so covariance lets Reviews' router hold both harnesses at the widened instantiation. Malformed usage degrades to `null` without failing the turn.
- **Finite timeouts always**: profile defaults (~120 s isolated, ~15 min read-only-agent), per-turn override, never infinite; deadline → existing SIGTERM/SIGKILL exec semantics → `timed-out`.
- **No streaming in this contract revision** — turn results are terminal only; richer event exposure is a future extension (resolves the streaming Fog item).

### Unified text generation

- **One routing `TextGenerator` implementation** (existing non-generic contract shape): resolves the per-call `modelRef`, routes by wiring policy to either a direct-inference executor or a per-call isolated session (create → runTurn → drain → map failures → close in `finally`). Forcing fact: kernel wiring exposes one `ctx.textGenerator` serving cross-provider refs per call, and isolated sessions are Claude-only, so per-call provider routing must be owned once. `PiTextGenerator` as a named public implementation dissolves into this; the convenience stays non-generic by reading the `TUsage` bound's core token fields.
- **No routing knob; policy is code.** `PI_DRAFT_HARNESS` retires with its orphaned module. If the wiring policy names a harness for a ref and that harness isn't usable there (binary missing, auth broken), that is an explicit per-call error — no PATH probes, no silent fallback to direct.
- **`maxTokens`/`reasoning` are documented advisory hints**: enforced on the direct path; on claude-code, `reasoning` maps to the effort env and `maxTokens` is inapplicable and documented as such. Fail-explicitly stays reserved for profile guarantees.
- **Empty output is a session-level failure kind** the convenience propagates.

### Deliberate behavior changes accepted for migration (CHANGE? territory in the inventory)

1. Reviews drops `--bare`/implicit-`ANTHROPIC_API_KEY` in favor of harness-managed auth with the pass-through env surface (CI keeps working via its injected key; dev machines gain native login); the argv-pinning tests are rewritten deliberately.
2. Reviews gains a finite turn timeout where today a hung CLI runs forever.

## Objective Impact

- Both grilling rows ("Settle the Harness, Session, profile, and turn domain model"; "Settle unified text-generation composition") are marked `[x]` with this update as evidence.
- The prototype row is now unblocked (all four blockers resolved) and is the next runner-executable slice.
- Fog resolved: streaming (terminal-only now, events later), structured-output ownership (transport parse in the session, semantic Zod above the seam), capability discovery (none — explicit factory rejection). Remaining Fog: package/subpackage naming, which stays with the placement row.
- Vocabulary: "workspace-agent" is renamed **read-only-agent** throughout the record; `Harness`, `Harness Session`, `isolated-generation`, `runTurn()`, `TurnResult<TUsage>` adopted as canonical.
- Assumptions 2 and 3 (honest shared result contract; `runTurn()` sufficiency) are settled by these decisions at design level; the LCD-result risk and the ns-exec-channel risk now have decided mitigations (bounded generic usage + diagnostics-carrying failure kinds; brand + route around).

## Follow-Ups

- Prototype row: exercise this exact contract with fake Claude and Codex harnesses; the prototype should specifically pressure-test the `TUsage` covariance at a routing layer and the seven-kind failure mapping from both harnesses' real failure shapes.
- Migration-staging decisions deferred to the placement grilling row: which duplicate `TextGenerator` contract copy survives, where the routing implementation lives, and the rollout order for the two accepted Reviews behavior changes.
- The `--bare` drop changes Reviews' Claude session-persistence posture (currently undefined per the inventory); the read-only-agent profile's history guarantee needs an explicit statement during prototype/migration.
