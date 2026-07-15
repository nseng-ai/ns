# Roadmap

## Work

- [ ] Ratify the parity contract and retire rejected cmux surfaces.
  - Publish a simple checklist reconciling every current cmux user-visible command, programmatic surface, and underlying workspace operation to the settled Herdr disposition in `objective.md`.
  - Remove cmux Claude plan tab, session summary, and branch-state summary completely, including the orphaned `ns-cmux-sidebar` command-backed skill and now-unused support code; retain cmux objective summary and `ns cmux exec workspace-summary`.
  - This is PR 1 because it gives the stack a durable contract and removes misleading source surface before Herdr implementation; it cannot combine with PR 2 without mixing cmux retirement review with a new package boundary and vendor adapter.
  - Policy: execute autonomously as one local Graphite branch and runner-owned commit; do not alter any settled disposition.
  - Evidence: checklist reconciliation is exhaustive, removed names have no live registration or orphaned residue, targeted tests pass, and full `just` passes.

- [ ] Establish `@nseng-ai/herdr` and deliver objective-summary parity.
  - Create the capability package with `api`, `ns`, and `pi` public doors justified by their importer classes, a narrow domain-shaped Herdr Consumer Gateway, CLI-first real adapter wiring at entrypoints, fake-driven tests, and explicit caller-ID targeting.
  - Register `/ns:herdr:sidebar:objective-summary`; preserve deterministic objective/slot/branch resolution and apply a Herdr-native workspace label plus metadata through an internal operation. Do not add a public generic Herdr workspace-summary command.
  - This is PR 2 because it establishes the independently reviewable package, gateway, host wiring, and smallest real Herdr vertical; it cannot combine with PR 3 because the five dispatch/open workflows build on this seam and form a larger orchestration review.
  - Depends on: PR 1.
  - Policy: execute autonomously as one local Graphite branch and runner-owned commit; use `@nseng-ai/herdr`, noun `herdr`, explicit IDs, and CLI wrappers. Stop if the installed Herdr contract contradicts the selected semantics.
  - Evidence: package topology and host boundaries conform, objective metadata behavior has fake-driven and registration coverage, targeted tests pass, and full `just` passes.

- [ ] Deliver Herdr dispatch and branch-opening parity.
  - Implement the mirrored `/ns:herdr:*` prompt dispatch, distinct trunk dispatch, workspace plan dispatch, caller-workspace focused-tab plan dispatch, and open-branch workflows.
  - Reuse ns-owned Graphite, Branch Memory, Saved Plan, Branch Context, and slot semantics; Herdr owns only workspace/tab creation, explicit targeting, and process launch. Preserve dry-run, confirmation, inference, and completion behavior where the cmux workflow has it.
  - This is PR 3 because the workflows share one orchestration story and one tested Herdr launch boundary; splitting them would create repetitive tightly dependent PRs, while combining with PR 2 would make the new package foundation unreviewably broad.
  - Depends on: PR 2.
  - Policy: execute autonomously as one local Graphite branch and runner-owned commit. Do not adopt Herdr worktree policy, raw sockets, Herdr-only features, or generic multiplexer abstractions.
  - Evidence: all selected command registrations and workflow scenarios pass, the parity checklist matches delivered behavior, targeted tests pass, and full `just` passes.

## Parked

- Herdr-only event subscriptions, agent waits, declarative layouts, and plugins.
- Raw socket event integration and generated protocol types unless a later Objective selects behavior that CLI wrappers cannot support.
- A public generic Herdr workspace-summary command, pending a second concrete Herdr consumer.
- A generic cross-multiplexer abstraction; revisit only if concrete duplicated semantics justify it.
