# Roadmap

## Work

- [x] Ratify the parity contract and retire rejected cmux surfaces.
  - Published `docs/herdr/cmux-parity-checklist.md`, reconciling current cmux user-visible commands, programmatic surfaces, and underlying workspace operations to settled Herdr dispositions.
  - Removed cmux Claude plan tab, session summary, and branch-state summary completely, including the orphaned `ns-cmux-sidebar` command-backed skill and now-unused support code; retained cmux objective summary and `ns cmux exec workspace-summary`.
  - PR 1 also isolated default Vitest model routing from ambient `NS_FAST_MODEL`/`NS_SLUG_MODEL`, repairing the full-repo gate exposed by the new repo model configuration.
  - Evidence: the stale-surface search leaves only classified historical/retirement-record matches; targeted cmux/areg/foundation tests, `areg check`, and full `just` pass on local branch `herdr-capability-parity-pr1`.

- [x] Establish `@nseng-ai/herdr` and deliver objective-summary parity.
  - Created the capability package with a private `core` feature subpackage consumed by a `pi` host-surface subpackage, exporting only `./pi` and `./pi/extension`; no empty/speculative `ns`, `api`, or root runtime door exists.
  - Added a narrow domain-shaped Herdr Consumer Gateway, CLI-first real adapter wiring at the Pi entrypoint, fake-driven tests, and explicit `HERDR_WORKSPACE_ID` targeting.
  - Registered `/ns:herdr:sidebar:objective-summary`; it preserves deterministic Objective selection/validation and applies `obj:<slug>` through `herdr workspace rename` to the explicit caller workspace. It performs no unused slot/branch reads and no metadata substitute.
  - Evidence: local branch `herdr-capability-parity-pr2`; Herdr package tests, topology report, TypeScript style guard, and full `just` pass.

- [x] Deliver Herdr dispatch and branch-opening parity.
  - Implemented the mirrored `/ns:herdr:*` prompt dispatch, distinct trunk dispatch, workspace plan dispatch, explicit caller-workspace focused-tab plan dispatch, and open-branch workflows.
  - Preserved ns-owned Graphite, Branch Memory, Saved Plan, Branch Context, slot checkout, dry-run, confirmation, inference, and branch completions. Herdr owns workspace/tab creation, explicit targeting, and command launch in returned opaque pane IDs.
  - Real-adapter tests pin workspace/tab creation JSON parsing, `--focus` caller-tab behavior, pane launch argv, malformed JSON, missing IDs, and command failures; fake-driven scenarios cover the user-visible workflow paths.
  - Evidence: local branch `herdr-capability-parity-pr3`; Herdr tests and full `just` pass, the parity checklist reconciles the delivered registrations, and the complete stack received one TypeScript style review with no accepted findings.

## Parked

- Herdr-only event subscriptions, agent waits, declarative layouts, and plugins.
- Raw socket event integration and generated protocol types unless a later Objective selects behavior that CLI wrappers cannot support.
- Objective/slot/branch metadata reporting, pending installed Herdr CLI support for `workspace report-metadata`.
- A public generic Herdr workspace-summary command, pending a second concrete Herdr consumer.
- A generic cross-multiplexer abstraction; revisit only if concrete duplicated semantics justify it.
