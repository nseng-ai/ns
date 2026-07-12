# Dispatch Extension

## Thesis

Dispatch is the ns workflow that hands a unit of planned work — a plan doc or a
raw prompt — to an executor. Today it exists only as Pi-only
`/ns:cmux:workspace:dispatch-plan` / `dispatch-prompt` / `dispatch-from-trunk`
(plus `/ns:cmux:surface:dispatch-plan`) commands over the `@nseng-ai/cmux`
dispatch cores, dispatching into local cmux workspaces. This objective makes
dispatch a first-class ns capability: a new capability package exporting a
repo-local `ns dispatch` command group (the proven flow pattern) with an
**execution-target seam** — `--target cmux` preserving today's local workspace
behavior, and `--target cloud` executing on Vercel infrastructure — with Pi as
a thin additive bridge and wrapper-skill coverage for Claude/Codex. Which
Vercel infrastructure backs the cloud target (an Eve app, Vercel Sandbox plus
the AI SDK `HarnessAgent` adapters, or another composition) is a decision this
objective owns.

## Scope

- A new capability package exporting the `ns dispatch` repo-local command
  group via the typed `exports["./ns-extension"]` descriptor module — the
  substrate the `extension-descriptor-contract` Objective completed and closed
  (2026-07-11): descriptors are now the sole declaration source, registered
  through `defineExtension` from `@nseng-ai/kernel/sdk` (see
  `ts/packages/capabilities/cmux/src/ns/extension.ts` for a live example), and
  the legacy `.ns/extensions/*` shims are gone and must not be reintroduced.
  Pi mirror via `registerCliCommandExtension`.
- `ns dispatch plan` and `ns dispatch prompt`, both honoring `--target`. The
  local/cmux target reuses the `@nseng-ai/cmux` dispatch cores
  (`ts/packages/capabilities/cmux/src/core/dispatch-from-trunk.ts`,
  `dispatch-prompt.ts`, `slot-dispatch-plan.ts`) as its backend; cmux becomes
  a target backend, not the owner of dispatch.
- The target-seam design itself: targets as explicit backends behind one
  command surface, so later targets do not reshape the CLI.
- The cloud-target infrastructure decision — Eve vs Vercel Sandbox +
  `HarnessAgent` (Claude Code / Pi adapters) vs another composition — recorded
  with rationale. Inputs live in `docs/wayfinding/ns-cloud-capabilities/`
  (Eve capability map, AI SDK harness findings).
- Cloud target implemented to the end-to-end bar: a real plan dispatched with
  `--target cloud` executes remotely and lands results git-natively — pushed
  branch plus a handoff/branch-memory record.
- Wrapper skill(s) and typed parity metadata for the new surfaces; the Pi
  `/ns:cmux:*:dispatch-*` commands become thin bridges over the same cores,
  keeping only Pi-native session-history "latest plan" resolution.

## Non-Goals

- `open-branch` and other cmux workspace navigation: not dispatch; stays a
  cmux/Pi concern.
- Completion notification/channel loops (Slack etc.), scheduling, event-driven
  triage, and speculative execution: vision-doc territory tracked in
  `docs/wayfinding/ns-cloud-capabilities/`, not this objective.
- Reviving cross-harness-parity's table/doctrine machinery. That Objective
  closed 2026-07-11 as intentionally concluded (not completed): the CLI-first
  doctrine did not graduate into a convention doc, and the parity doctrine's
  successor home is the future end-to-end docs effort. This objective complies
  with the surviving distributed mechanisms (typed `definePiSurfaceParity`
  metadata, per-package fake-host parity tests, wrapper skills) rather than
  reviving the table.
- No runtime Graphite dependency in dispatch runtime code beyond the
  sanctioned boundaries (`docs/conventions/graphite-dependency-boundary.md`).

## Completion Criteria

- `ns dispatch plan|prompt` exist as repo-local kernel commands reachable from
  every harness, with wrapper-skill coverage and typed parity metadata; Pi
  dispatch surfaces are thin bridges over the same cores with no duplicated
  orchestration.
- `--target cmux` preserves current dispatch behavior, validated against the
  existing workflows.
- The cloud-target infrastructure decision is recorded as a Semantic Update
  with rationale against the alternatives considered.
- One real plan dispatched with `--target cloud` executes on the chosen
  Vercel infrastructure end-to-end and lands results git-natively: pushed
  branch plus handoff/branch-memory record.
- Evidence: targeted `just ts-check` / `just ts-test` pass for changed areas;
  CLI scenario tests cover the new commands' operations, help, and version.

## Assumptions and Risks

Assumptions:

- The cmux dispatch cores are extraction-ready (validated by the 2026-06-03
  parity audit, and reinforced by surviving the 2026-07-11 CCC→cmux reshape
  — ADR 0034 — as intact `src/core/` modules): the local target is CLI-entry
  - skill work, not logic extraction.
- The durable registration substrate is the typed `exports["./ns-extension"]`
  descriptor module delivered by the completed `extension-descriptor-contract`
  Objective (closed 2026-07-11); the flow capability proved the repo-local
  `ns`-command pattern at scale, and the cmux capability already registers
  `ns cmux exec workspace-summary` through the same substrate.
- ns state travels via git: a cloud executor with a repo checkout inherits
  objectives, branch context, and branch memory with no state-sync layer.
- The AI SDK harness adapters (`@ai-sdk/harness-claude-code`,
  `@ai-sdk/harness-pi`) can run ns's existing harnesses in sandboxes with ns
  skills injected via the Agent Skills standard (verified in source
  2026-07-08; APIs explicitly experimental).
- Eve and `HarnessAgent` are separate Vercel surfaces today — Eve does not
  consume `HarnessAgent` (verified 2026-07-08) — so the cloud-target decision
  cannot assume they compose out of the box.

Risks:

- Experimental churn: the AI SDK harness packages warn of breaking changes;
  Eve is beta on a 5.0-beta Workflow SDK. Mitigation: keep the target seam
  thin and vendor types out of ns package APIs so churn is absorbed at the
  target backend.
- Cloud identity/secrets (repo access, push rights, model keys) may dominate
  the cloud leg's cost; Eve's sandbox is deliberately secret-free while
  HarnessAgent uses a bridge model — the credentials slice must be designed,
  not assumed.
- cross-harness-parity closed without the predicted convention-doc
  graduation, so no standing orientation or doctrine doc polices CLI-first
  discipline for new dispatch surfaces. The current cmux Pi dispatch surfaces
  carry no parity metadata. Mitigation: this objective's own completion
  criteria require typed parity metadata and wrapper-skill coverage, and the
  distributed parity gate (`definePiSurfaceParity` + fake-host parity tests)
  remains live in flow/objectives/hosts-pi as the pattern to follow.
- Local-target regression: retargeting daily-driver cmux dispatch behind a new
  CLI could break existing muscle memory and flows; Pi bridge behavior must
  stay equivalent.

## Open Questions

- Which cloud infrastructure backs `--target cloud`: an Eve app, Vercel
  Sandbox + `HarnessAgent`, or another composition? Owned here as a roadmap
  decision row; inputs from `docs/wayfinding/ns-cloud-capabilities/`.
- Return-path shape beyond the pushed branch + handoff: does the dispatching
  session poll, or is completion discovered purely via git/handoff inspection?
- Package identity and home for the new capability under `ts/packages/`
  (platform capability per `docs/conventions/platform-and-consumer.md`).
