---
edges:
  - objective: flow-land-architecture-deepening
    annotation: "Successor that reverses the closed predecessor's deliberate orchestration deferral now that idle in-memory fakes, transcript-only mutation coverage, and the standing test-performance direction justify finishing the domain-core migration."
  - objective: flow-land-incremental-perf-rollout
    annotation: "Preserves the historical relationship to the CLOSED rollout: its unchanged transcript scenarios remain the performance measurement set, with corrected baselines linear-11 = 140 and linear-25 = 308, while execution migrates beneath them."
---

# Flow Land Execution Migration

## Thesis

Flow land has a read-only domain core over the injected `LandContext` gateway set, but actual mutation orchestration still lives under `src/land/stack/` and root execution files. The mutating gateway methods and most in-memory fakes are consequently idle, while the mutation path's principal default-lane protection is a large scripted-transcript suite. This Objective finishes the migration: execution phases move onto `LandContext` plus narrow host seams, duplicate failure and execution vocabularies collapse, and mutation decisions become directly testable with in-memory fakes.

This is the successor to the closed `flow-land-architecture-deepening` Objective and deliberately reverses its recorded decision to leave executable orchestration under `stack/` "for this pass." The new evidence is the remaining idle fake surface, transcript-only mutation coverage, and the standing direction that default tests use in-memory gateways while real backends stay in the integration lane. It also preserves the historical relationship to the closed `flow-land-incremental-perf-rollout` Objective without reopening it: the permanent transcript measurement set remains unchanged, and its correct current baselines are linear-11 = 140 calls and linear-25 = 308 calls (not the stale 145/313 prose in that closed record).

## Scope

- Move execution phases into core modules under `src/land/execution/`, expressed over `LandContext` and narrow progress/confirmation host seams. Flow-side entrypoints continue to parse, construct real adapters and host seams, call core execution, and present results.
- Unify execution failures, results, worktree facts, landed-PR facts, retained-cleanup facts, Graphite operation vocabulary, and worktree-path helpers in the core. Adapter-only pi loaders remain adapter internals; they are not migrated into core.
- Migrate post-landing cleanup, isolated landing, maintenance, pre-merge preparation, and the merge loop before rewiring `executeLanding` to delegate execute mode end-to-end to the core.
- Expand `testing.ts` with the fake behavior and failure-injection knobs needed by each migrated phase. Every new fake knob must ship with a paired adapter protocol test proving that the real adapter produces the same typed variant from representative stdout, stderr, and exit codes.
- Extend the import-direction boundary as modules move: `execution/` never imports `stack/`, pi, command-stream, or kernel UI; only adapter-family modules execute commands. Core imports remain limited to foundation, sibling core modules, and the existing commit-display boundary.
- Keep `land-presentation.ts` as one consolidated module, adding prompt, notification, and flow-owned refusal text builders without splitting it. Keep the documented `registerLandCommand` / `runLandCli` command-face layering intact.
- Preserve CCC entry through `@nseng-ai/flow/api`, retain all existing API exports, and keep the `./land/api` and `./land/testing` export-map paths stable.

## Non-Goals

- Changing subprocess command shape or ordering, prompt count or evaluation point, safety gates, telemetry semantics, user-visible text, exit-code/failure-level behavior, or the serial landing model.
- Migrating pi-based fact loaders in `stack-facts.ts`, `worktrees.ts`, or `pr-facts.ts`; those are real-adapter internals.
- Splitting the consolidated presentation module, restructuring the two command faces, renaming `stack/` to `adapters/`, generalizing telemetry, or extracting phase streaming.
- Typed-variant branching for `graphiteRefreshFailure` or implementing isolated-target execution in the canonical stack executor. Slice 10 supersedes the earlier deferral of upfront approvals: Flow now represents observed upfront approval through a confirmation-gateway decorator, while dispatch still owns the upfront prompt and routing.
- Reopening or completing the closed incremental performance rollout. Its historical measurement relationship is retained, but performance work needs its own future Objective.
- Pruning transcript scenarios or fixtures. Duplication between transcript and fake-driven tests is deliberate until later measurement work confirms which scenarios remain necessary.

## Completion Criteria

- Slices 1–14 in `roadmap.md` are complete, including the two-sub-PR high-risk Slice 7, end-to-end execute-mode ownership in Slice 9, and confirmation/API remediation in Slice 10.
- Execution phases run over `LandContext` plus a required narrow execution host; core execution imports no adapter, pi, command-stream, or kernel UI implementation, and only adapter-family code invokes subprocess execution. Upfront approvals are explicit approved request kinds intercepted by the Flow confirmation adapter, never transport booleans.
- Duplicate stack failure/result/concept vocabularies and completed migration shims are removed; legitimate inbound adapter normalization remains explicitly named and documented.
- Fake-driven tests cover decision matrices, guard refusals, typed failure breadth, warning aggregation, and gateway request order/shape. Every added fake knob has paired real-adapter protocol coverage.
- The transcript scenario suite and all listed fixtures remain byte-for-byte unchanged across every slice. Their telemetry assertions remain linear-11 = 140 and linear-25 = 308; no performance claim is sourced from fake-driven tests.
- Every original migration slice passes its recorded gates; remediation slices record the validation required by their authoritative branch contracts. Slices 7 and 9 also pass `just ts-test-integration`. Each slice records green validation and permanent transcript/fixture invariant evidence.
- Execute mode no longer reports `skipped: "merge execution remains in Flow"`; `executeLanding` owns the real phase, landed-chunk, and cleanup outcomes while dispatch confirmation, routing, and cleanup-decision ordering remain unchanged.

## Definition of Progress

A slice is keepable only when it preserves command shape/order, prompts, safety behavior, and user-visible text; leaves the scenario file and listed fixtures unchanged; adds paired adapter protocol coverage for every new fake knob; and passes both `just` and the focused Flow test suite. Slices 7 and 9 additionally require the integration lane. Objective evidence records the validation commands and the empty invariant diff before the next slice advances.

The permanent invariant paths are:

- `ts/packages/capabilities/flow/test/unit/land-stack-command-scenarios.test.ts`
- `ts/packages/capabilities/flow/test/unit/land-stack-script-fixtures.ts`
- `ts/packages/capabilities/flow/test/unit/land-stack-backup-ref-fixtures.ts`
- `ts/packages/capabilities/flow/test/unit/land-test-helpers.ts`
- `ts/packages/capabilities/flow/test/unit/git-state-fs-support.ts`
- `ts/packages/capabilities/flow/test/unit/land-stack-topology-guards.test.ts`

Do not keep a slice that reconstructs command strings in fake tests, weakens a strict gate or refusal path, changes a transcript expectation to accommodate migration drift, or prunes scenario coverage. Fake-driven tests assert gateway request objects and decisions; transcript tests remain the exact subprocess-protocol and telemetry authority.

## Assumptions and Risks

**Assumptions**

- Most execution phases are already close to gateway-expressed after the architecture-deepening work; `post-landing-slot-cleanup.test.ts` and `land-graphite-maintenance.test.ts` demonstrate the intended in-memory testing style.
- Real command streaming and telemetry remain fully encapsulated by adapters constructed before `LandContext`, so core migration need not know about either concern.
- The current transcript suite is a sufficient behavior lock while fake-driven tests are added underneath it, provided the scenario and fixture invariant is enforced per slice.
- `./land/api` and `./land/testing` currently have no external consumers, but their export-map stability remains a binding compatibility constraint.

**Risks**

- Two clean-repository checks currently have different user-visible wording. The migrated pre-merge recheck must preserve the stack wording exactly: `Working tree is dirty; refusing to start stack landing.` and the existing in-progress-operation variant, rather than silently adopting preflight wording.
- Confirmation refusals embed flow-owned prompt text. Returning a fully worded refusal failure from the confirmation gateway avoids moving presentation policy into core, but requires exact parity tests for interactive and non-interactive paths.
- Slice 7 moves the highest-risk orchestration and can subtly reorder gateway calls, merge accumulation, verification, or maintenance. It is split into pre-merge and merge-loop sub-PRs and requires focused call-order tests plus the integration lane.
- Fake models can drift from real adapters. Paired adapter protocol tests are mandatory for each new fake knob, and protocol/telemetry claims continue to come only from transcript coverage.
- Rewiring execute mode can disturb dispatch ordering or host safety. Slice 10 supersedes the absent-host default: `ExecuteLandingOptions` requires a host and source; callers that must refuse explicitly use the exported refusing confirmation gateway, never implicit approval.

## Open Questions

- None block the approved slice sequence. Typed branching for `graphiteRefreshFailure`, adapter-directory renaming, isolated-target core support, upfront-dispatch confirmation migration, scenario pruning, and telemetry/phase-stream generalization remain explicit follow-ups outside this Objective.
