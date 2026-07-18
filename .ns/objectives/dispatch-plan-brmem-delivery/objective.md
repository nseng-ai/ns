---
edges:
  - objective: cloud-execution
    annotation: Focused delivery slice — this Objective owns the user contract and implementation evidence for `ns dispatch plan`; cloud-execution owns the surrounding Vercel dispatch spine and broader cloud program.
---

# Dispatch Plan through Generic Branch Memory Instructions

## Thesis

`ns dispatch plan <plan-ref>` sends a Saved Plan through the existing
Vercel-native cloud dispatch spine without embedding plan content in HTTP or
Workflow input. It resolves the plan locally, opens the dispatch anchor, ensures
the exact plan is a normal Branch Context Attached Plan on that anchor branch,
and creates a generic `dispatch-context/<dispatch-id>/instructions.md` Entry
that names the attachment and pins its commit. The Workflow receives only the
Dispatch ID and exact instruction locator. Sandbox supervision fetches all
Branch Memory refs, verifies the pinned instruction Snapshot and Entry, and
launches the harness with the same `brmem get`-first bootstrap used by prompt
dispatch.

This is a README-driven Objective. The canonical package contract lives in
`ts/packages/capabilities/vercel/README.md`; the broader cloud experience lives
in `.ns/objectives/cloud-execution/references/README-draft.md`.

## Scope

- `ns dispatch plan <plan-ref>` with explicit Saved Plan input; latest-session
  selection remains Pi sugar.
- One Dispatch ID shared across anchor, instructions, Workflow attributes,
  command output, and PR provenance.
- One generic anchor-scoped instruction Entry in Namespace `dispatch-context`,
  key `<dispatch-id>/instructions.md`.
- One anchor-scoped Attached Plan in Namespace `branch-context`, key
  `<plan-slug>.md`, created when absent, reused when byte-identical, and refused
  without overwrite on conflict.
- Instruction text that identifies the Attached Plan's branch, key, Entry
  Locator, and pinned commit and directs the agent through the established
  Branch Context implementation path.
- Branch Memory setup preflight with actionable `brmem setup-git` refusal,
  exact Snapshot publication/verification, and complete partial-failure
  evidence.
- Locator-only HTTP/Workflow input with no plan body and no prompt/plan work-kind
  discriminator.
- Sandbox fetch of all `refs/brmem/*`, exact instruction Snapshot verification,
  deterministic `brmem check`, and one generic harness bootstrap.
- Progressive disclosure: compact human output and PR presentation, full
  instruction and attachment provenance in machine/recovery records.
- One witnessed real Saved Plan dispatch after deployable build and deployment.

## Non-Goals

- A public arbitrary Branch Memory locator command.
- Copying the plan under `dispatch-context`, accepting Attached Plans as the
  command's input model, or selecting a mutable/latest remote plan.
- Automatic Branch Memory setup or cleanup.
- A second cloud spine, non-Vercel backend, standing sandbox Git credential,
  another harness, handoff dispatch, jobs UI, or scheduled work.

## Completion Criteria

- The canonical READMEs describe generic instructions and normal anchor-scoped
  Attached Plans without retaining the superseded
  `<dispatch-id>/plan/<plan-slug>.md` contract as current behavior.
- Plan dispatch resolves an explicit Saved Plan, creates an anchor, ensures the
  exact Attached Plan without overwrite, publishes both required Branch Memory
  state changes, and starts the Workflow with only the pinned instruction
  locator.
- Prompt and plan share the same Workflow input, delivery, fetch-all,
  instruction precheck, and harness bootstrap implementation.
- Failures before Workflow start report the Dispatch ID, anchor, and every
  durable artifact already created; remote retrieval failures are reported on
  the anchor PR.
- Fake-driven tests cover attachment create/reuse/conflict, instruction
  non-overwrite/publication, locator validation, payload content absence,
  fetch-all and exact precheck, Dispatch ID propagation/recovery, command
  output, and wrapper parity.
- A new deployable build and deployment carry the redesigned contract, then one
  witnessed plan run proves exact instruction retrieval, pinned Attached Plan
  loading, plan execution, an agent-created commit, and normal anchor landing.

## Current Evidence

The redesigned generic path is locally implemented and green under fake-driven
package tests and TypeScript validation. It is **not deployed or live-proven**.
The implementing worktree lacks local Vercel Project Settings, so
`build:deployable` remains blocked until an authorized setup/deployment session.

Preserved historical evidence: the earlier implementation locally proved Saved
Plan resolution, non-overwriting Branch Memory writes, exact Snapshot
publication/verification, locator-only plan payloads, Dispatch ID Workflow
attributes and fake Analytics recovery, command/wrapper output, and sandbox
precheck behavior under the now-superseded plan-copy layout. Separately,
`cloud-execution` witnessed the shared Workflow/Sandbox spine and one raw-prompt
run. Those facts remain useful evidence for their boundaries, but neither proves
the redesigned anchor-scoped instruction/Attached Plan path.

## Definition of Progress

Progress is keepable when one coherent local slice is fake-driven and validated,
all Attached Plan policy remains owned by Branch Context, raw work content stays
off the wire, and prose distinguishes local implementation, deployable build,
deployment, and witnessed execution.

Do not keep changes that overwrite an attachment, copy the plan into the generic
instruction Entry, weaken exact commit selection, mutate setup automatically,
perform unconfirmed external writes, or claim live proof not witnessed by the
actor recording it.

## Runner Policy

Local-only Objective work may edit package code, tests, wrappers, README prose,
and tracking. It may not run mutating Branch Memory commands, configure
synchronization, push refs, deploy, trigger workflows, mutate anchor PRs, or
publish a stack. `build:deployable` should run when Project Settings are
available; absence is recorded as a blocker rather than bypassed.

Stop for design review before changing the public input model, Namespace or
retention lifecycle, pinned-commit semantics, remote ref synchronization,
Vercel-native architecture, or durable README destination.

## Assumptions and Risks

- Fetching all Branch Memory refs during setup is acceptable for this version;
  introduce a bounded manifest only if real scale evidence requires it.
- Plan attachment and instruction publication are separate Namespace snapshots.
  Ordering and recovery evidence must make partial success explicit.
- Anchor-first delivery can leave setup-failed PRs open; those PRs are durable
  recovery records and must never imply a Workflow started when it did not.
- Analytics lookup is eventually observable and non-unique; retain the direct
  run ID and refuse zero or multiple recovery matches.
- Generic sharing must remain deep: deleting the common orchestration should
  force prompt and plan to duplicate meaningful delivery and run mechanics.

## Open Questions

None block local implementation. Automatic cleanup and a public generic Branch
Memory dispatch command remain deliberately deferred.
