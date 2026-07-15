# Roadmap

## Work

- [x] Ratify the parity contract and retire rejected cmux surfaces.
  - Published `docs/herdr/cmux-parity-checklist.md`, reconciling current cmux user-visible commands, programmatic surfaces, and underlying workspace operations to settled Herdr dispositions.
  - Removed cmux Claude plan tab, session summary, and branch-state summary completely, including the orphaned `ns-cmux-sidebar` command-backed skill and now-unused support code; retained cmux objective summary and `ns cmux exec workspace-summary`.
  - PR 1 also isolated default Vitest model routing from ambient `NS_FAST_MODEL`/`NS_SLUG_MODEL`, repairing the full-repo gate exposed by the new repo model configuration.
  - Evidence: the stale-surface search leaves only classified historical/retirement-record matches; targeted cmux/areg/foundation tests, `areg check`, and full `just` pass on local branch `herdr-capability-parity-pr1`.

- [ ] Establish `@nseng-ai/herdr` and deliver objective-summary parity.
  - Create the capability package with a private `core` feature subpackage consumed by a `pi` host-surface subpackage, exporting only `./pi` and `./pi/extension`. No selected behavior requires an `ns` host command or cross-package Capability API, so do not create empty/speculative `ns` or `api` doors.
  - Add a narrow domain-shaped Herdr Consumer Gateway, CLI-first real adapter wiring at the Pi entrypoint, fake-driven tests, and explicit caller-ID targeting.
  - Register `/ns:herdr:sidebar:objective-summary`; preserve deterministic objective/slot/branch resolution and apply a Herdr-native label to the explicit caller workspace. Skip metadata reporting for now because the installed Herdr CLI lacks `workspace report-metadata`; do not invent a substitute transport or add a public generic Herdr workspace-summary command.
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
- Objective/slot/branch metadata reporting, pending installed Herdr CLI support for `workspace report-metadata`.
- A public generic Herdr workspace-summary command, pending a second concrete Herdr consumer.
- A generic cross-multiplexer abstraction; revisit only if concrete duplicated semantics justify it.
