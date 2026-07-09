# Dispatch Extension

## Thesis

Dispatch is the ns workflow that hands a unit of planned work — a plan doc or a
raw prompt — to an executor. Today it exists only as Pi-only
`/ccc:workspace:dispatch-plan` / `/ccc:workspace:dispatch-prompt` commands over
the `@nseng-ai/ccc` cmux cores, dispatching into local cmux workspaces. This
objective makes dispatch a first-class ns capability: a new capability package
exporting a repo-local `ns dispatch` command group (the proven flow pattern)
with an **execution-target seam** — `--target cmux` preserving today's local
workspace behavior, and `--target cloud` executing on Vercel infrastructure —
with Pi as a thin additive bridge and wrapper-skill coverage for Claude/Codex.
Which Vercel infrastructure backs the cloud target (an Eve app, Vercel Sandbox
plus the AI SDK `HarnessAgent` adapters, or another composition) is a decision
this objective owns.

## Scope

- A new capability package exporting the `ns dispatch` repo-local command
  group via a kernel descriptor under `.ns/extensions/`, with the Pi mirror
  via `registerCliCommandExtension`.
- `ns dispatch plan` and `ns dispatch prompt`, both honoring `--target`. The
  local/cmux target reuses the `@nseng-ai/ccc` cmux cores
  (`dispatch-from-trunk.ts`, `dispatch-prompt.ts`, `slot-dispatch-plan.ts`) as
  its backend; ccc becomes a target backend, not the owner of dispatch.
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
  `/ccc:workspace:dispatch-*` commands become thin bridges over the same
  cores, keeping only Pi-native session-history "latest plan" resolution.

## Non-Goals

- `open-branch` and other cmux workspace navigation: not dispatch; stays a
  ccc/Pi concern.
- Completion notification/channel loops (Slack etc.), scheduling, event-driven
  triage, and speculative execution: vision-doc territory tracked in
  `docs/wayfinding/ns-cloud-capabilities/`, not this objective.
- Reviving cross-harness-parity's table/doctrine machinery; the CLI-first
  doctrine graduates to a convention doc as part of that objective's close,
  and this objective simply complies with it.
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

- The `@nseng-ai/ccc` cmux cores are extraction-ready (validated by the
  2026-06-03 parity audit): the local target is CLI-entry + skill work, not
  logic extraction.
- The kernel repo-local extension mechanism is the durable substrate; the flow
  capability proved the pattern at scale.
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
- Closing cross-harness-parity removes the standing orientation that policed
  CLI-first discipline; new dispatch surfaces must carry parity metadata and
  skill coverage without the umbrella watching. The graduated convention doc
  is the mitigation.
- Local-target regression: retargeting daily-driver cmux dispatch behind a new
  CLI could break existing muscle memory and flows; Pi bridge behavior must
  stay equivalent.

## Open Questions

- Which cloud infrastructure backs `--target cloud`: an Eve app, Vercel
  Sandbox + `HarnessAgent`, or another composition? Owned here as a roadmap
  decision row; inputs from `docs/wayfinding/ns-cloud-capabilities/`.
- Return-path shape beyond the pushed branch + handoff: does the dispatching
  session poll, or is completion discovered purely via git/handoff inspection?
- ccc bin repair-or-retire (inherited from cross-harness-parity's open
  question): likely retire in favor of `ns dispatch`; decide during the
  local-target slice.
- Package identity and home for the new capability under `ts/packages/`
  (platform capability per `docs/conventions/platform-and-consumer.md`).
