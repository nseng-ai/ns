# Harness Session Contract Prototype

This is a throwaway, Objective-owned typed prototype. It is deliberately outside the pnpm workspace, package exports, and all live consumer wiring. It tests the candidate contract before package placement is decided; it is not production capability.

## Run

From the repository root:

```sh
pnpm --dir ts exec tsc -p ../.ns/objectives/harness-session-generation/references/prototype/tsconfig.json
node --test .ns/objectives/harness-session-generation/references/prototype/prototype.test.ts
```

## What the prototype demonstrates

- Concrete Claude Code and Codex harness modules expose profile-specific factories instead of implementing a shared `Harness` interface.
- Session creation fixes identity, system prompt, output mode, execution context, and timeout. `runTurn()` receives only turn content, cancellation, and a timeout override.
- Isolated generation is a strict Claude-only, single-turn profile. Codex rejects it explicitly because its CLI cannot enforce the settled no-tools, no-skills, no-global-instructions, and system-prompt-replacement guarantees.
- Read-only-agent sessions support both harnesses, an explicit repository cwd, sequential session-local history, disabled history persistence, and text or transport-parsed structured output. The schema is carried on the execution request rather than merely retained in the session type.
- `TurnResult<TUsage>` keeps provider-native usage covariant over a shared token core: Claude retains its full usage record (or degrades malformed usage to `null`), Codex uses `null`, and a router can widen both without erasing their concrete factories.
- Provider adapters parse provider-specific stdout envelopes and authentication diagnostics from minimally classified raw process evidence. Exactly seven terminal failure kinds remain: invocation, authentication, execution, cancellation, timeout, empty output, and invalid output.
- A branded full-fidelity exec channel has a real `execute` contract carrying cwd, env, stdin, `AbortSignal`, finite timeout, structured schema, startup error, and raw exit evidence. Constructor-state fakes execute through it and expose copied requests for protocol assertions.
- One routing `TextGenerator` composes direct inference and per-call isolated sessions through an isolated-session factory seam. It validates qualified model refs, rejects empty output on both routes, and never silently falls back from an unusable selected harness.
- Session creation eagerly acquires its resource. The isolated convenience closes in `finally`; close attempts cleanup exactly once and suppresses cleanup failure as best-effort behavior.

## Interface-depth comparison

### Candidate session seam

Callers learn one profile-specific factory, `runTurn({ input, signal?, timeoutMs? })`, the terminal result union, and `close()`. Behind that interface sit harness argv/environment construction, auth inheritance, eager resource acquisition, cwd/resource ownership, provider-specific transport parsing, failure classification from raw evidence, usage preservation, cancellation/timeout translation, history/persistence policy, and best-effort cleanup. Deleting the session module would force those responsibilities back into every Reviews runner and harness-backed text-generation caller, so the module has real depth.

The profile-specific creation options are intentionally separate. Combining them into one optional bag would make callers understand illegal combinations of repository cwd, isolation guarantees, output mode, tools, and persistence. Likewise, a shared `Harness` interface would be shallow: the concrete modules have different honest factory sets because Codex cannot create strict isolated sessions.

### Unified text-generation seam

The routing generator earns its seam by owning qualified-model validation and routing, direct-vs-harness execution, session creation through a Claude isolated-session factory, terminal text extraction, empty/failure conversion, usage narrowing, and unconditional closure. Callers keep the existing non-generic `generateText(request)` shape and contain no provider branches. Separate provider-specific `TextGenerator` subclasses would move routing and fallback semantics into wiring/callers without reducing complexity.

### Existing layers compared

- `ts/packages/kernel/src/sdk/text-generation.ts` and `ts/packages/capability-kit/src/kit/text-generation.ts` duplicate the same caller contract. The prototype needs one copy; placement grilling must choose the surviving owner rather than add a third production copy.
- `ts/packages/kernel/src/runtime/pi-text-generation.ts` currently combines direct Pi inference, model lookup, auth, result conversion, and the public generator role. In the candidate design, direct inference becomes one injected executor while the routing generator owns only cross-path policy and common convenience behavior.
- `ts/packages/hosts/pi/src/kit/shared/fast-text-draft.ts` duplicates temporary-resource, subprocess, routing-knob, and cleanup behavior. Its production call count is already zero; the candidate session seam makes those mechanics unnecessary rather than wrapping that module.
- Reviews' Claude and Codex runners currently duplicate lifecycle, native parse/failure mapping, output handling, and cleanup while callers retain provider branches. The candidate read-only-agent session absorbs those mechanics but deliberately leaves Reviews-semantic Zod validation, qualified-model identity, progress/results/log identity, and findings policy above the seam.
- The narrow `NsCommandExecApi` is not widened. Requiring a branded full-fidelity channel makes env, signal, stdin, startup-error, and free-cwd support explicit and lets ns hosts construct the Node channel directly.

## Rejected shallow layers

- A marker-only shared `Harness` interface: it cannot honestly promise the same profile factories.
- A generic subprocess wrapper: callers would still own argv, profile guarantees, auth, parsing, failures, and cleanup.
- Provider-specific `TextGenerator` subclasses: callers or wiring would still own per-call routing and fallback policy.
- One options bag for every profile: it exposes invalid combinations instead of enforcing guarantees at creation.
- Capability discovery: settled profiles are compile-time factory surfaces; unsupported creation is an explicit result.
- A common usage record that drops native fields: bounded covariance preserves Claude metadata and Codex's honest `null`.

## Promotion path

After the prototype-backed placement grilling, discard or mine this code into the package and curated subpaths selected there. If placement remains consumer-specific, the first promotion rung is a tested `ts/packages/internal/*` package; if the two production consumers establish a reusable platform seam, promote directly into the selected platform package. In either case, production code must be rewritten against real command adapters and conformance tests rather than importing this Objective artifact. Delete the prototype once its decisions and evidence have been captured durably.
