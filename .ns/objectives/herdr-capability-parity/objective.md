# Herdr Capability Parity

## Thesis

Document the full capability surface of the existing cmux extension, decide which capabilities meaningfully apply to Herdr, and implement the selected capabilities in a separate first-party Herdr capability/extension. Preserve Herdr-native vocabulary and behavior rather than forcing mechanical cmux parity.

## Scope

Inventory the user-visible and programmatic capabilities currently owned by `@nseng-ai/cmux`, including its ns and Pi extension surfaces and the underlying workspace operations they expose. Publish a simple checked-in parity checklist with the settled dispositions below, then deliver the work as a three-PR local Graphite stack.

Create the separate capability package `@nseng-ai/herdr` with Pi commands that mirror the selected cmux suffixes under `/ns:herdr:*`. Its package shape is a private `core` feature consumed by a `pi` host surface, exporting only `./pi` and `./pi/extension`: no selected behavior requires an `ns` host command or cross-package Capability API, so empty `ns`/`api` doors would fail the subpackage rank test. Preserve ns-owned Graphite, Branch Memory, Saved Plan, Branch Context, and slot orchestration; Herdr owns the final workspace/tab, process launch, explicit caller targeting, and workspace labeling. Use explicit caller or returned Herdr IDs rather than UI focus, prefer CLI wrappers, and extract vendor-neutral orchestration only where matching semantics are demonstrated.

Selected Herdr parity:

- `/ns:herdr:workspace:dispatch-prompt` preserves prompt dispatch through ns slots.
- `/ns:herdr:workspace:dispatch-from-trunk` remains a distinct refreshed-trunk variant.
- `/ns:herdr:workspace:dispatch-plan` opens the Attached Plan checkout in a new Herdr workspace.
- `/ns:herdr:surface:dispatch-plan` opens a focused tab in the caller's Herdr workspace.
- `/ns:herdr:workspace:open-branch` preserves explicit and inferred branch selection, confirmation, completions, and ns slot checkout.
- `/ns:herdr:sidebar:objective-summary` applies a Herdr-native label to the explicit caller workspace. Objective/slot/branch metadata reporting is deferred because the installed Herdr CLI lacks `workspace report-metadata`; no substitute transport or public generic Herdr workspace-summary command is added.

Retire `/ns:cmux:claude-plan-tab`, `/ns:cmux:sidebar:session-summary`, and `/ns:cmux:sidebar:branch-state-summary`, including orphaned skills, registrations, exports, tests, and helpers. Retain cmux objective summary and `ns cmux exec workspace-summary`.

The existing research in `docs/research/herdr-programmability.md` is the starting evidence for Herdr's CLI, local socket API, caller IDs, workspace/tab/pane operations, worktree support, metadata, events, layouts, and plugins.

## Non-Goals

- Recasting `@nseng-ai/cmux` as a generic lowest-common-denominator terminal multiplexer abstraction.
- Adding Herdr support inside the cmux package.
- Mechanically reproducing cmux presentation where Herdr has different native concepts.
- Committing to raw socket integration before the CLI surface proves insufficient.
- Replacing ns slot checkout policy with Herdr-native worktree orchestration.
- Adding Herdr-only event subscriptions, waits, declarative layouts, plugins, or a public generic workspace-summary command.

## Completion Criteria

- A checked-in checklist inventories the current cmux extension's user-visible and programmatic capabilities and gives each an explicit Herdr applicability disposition.
- The implementation scope selected from that checklist is explicit, with non-selected applicable work retained as visible follow-up rather than silently omitted.
- The selected capabilities work end to end through a separate Herdr capability/extension using stable caller targeting and Herdr-native workspace, tab, and pane concepts; objective metadata remains an explicit follow-up until the installed CLI supports it.
- Capability behavior has targeted tests and full `just` validation passes for every committed runner slice.
- Three coherent local Graphite branches exist in order: parity contract and cmux retirements; Herdr foundation and objective metadata; dispatch and branch workflows. No branch or PR is pushed or submitted by autonomous execution.

## Definition of Progress

Progress is keepable when:

- one roadmap row is implemented as one coherent, reviewable local Graphite branch and runner-owned commit;
- the row preserves the fixed package, command, targeting, orchestration, and parity decisions in this record;
- relevant tests cover the behavior and full `just` passes before the slice is committed; and
- public surface removal includes registrations, exports, tests, documentation or skills, and now-unused helpers so no misleading residue remains.

Do not keep changes that weaken explicit Herdr targeting, move ns-owned checkout policy into Herdr, introduce the generic multiplexer abstraction, leave a selected workflow partially wired, or fail full `just` validation.

Useful evidence includes command-registration and scenario tests, fake-driven gateway tests, package/type boundaries, parity-checklist reconciliation, and the successful `just` invocation recorded for each slice.

## Runner Policy

This Objective is designed for autonomous pursuit through repeated Objective Runner steps.

- Direct execution is allowed for the three ordered roadmap rows, including local file edits, formatter fixes, tests, local Graphite branch creation, staging, and one runner-owned commit per row.
- The package and public names are fixed: `@nseng-ai/herdr` and the mirrored `/ns:herdr:*` suffixes listed in Scope. The parity dispositions, three-PR boundaries, explicit-ID targeting rule, ns-slot ownership, CLI-first integration, and cmux retirements are also fixed.
- Implementation may resolve private types, module decomposition, argv parsing, fake design, and other non-public mechanics autonomously when they honor the fixed contract and repository conventions.
- Stop and ask before changing a fixed public name or parity disposition, moving work between PR rows, crossing the separate-capability boundary, introducing raw socket integration or a generic abstraction, or accepting installed Herdr behavior that cannot satisfy the fixed workflow semantics.
- Run full `just` before every runner commit. A failing slice is not keepable; repair relevant failures within the row, and stop with exact evidence if full validation cannot be made green without unrelated work or a scope decision.
- Leave each successful slice committed on its local Graphite branch and begin the next row from that branch. Objective tracking updates happen only between runner steps through `objective-update`.
- Do not push, submit, publish, merge, land, create or update pull requests, deploy, or mutate any external system. The completed local stack stops for human review and separately authorized submission.

## Assumptions and Risks

**Assumptions**

- Herdr's documented CLI and schema-described local API provide enough stable control surface for cmux-analogous ns workflows; `docs/research/herdr-programmability.md` supports this against upstream commit `5d24d0d214d05858e344a9e15a63856dc1328eae`.
- A separate Herdr capability/extension can reuse selected orchestration without requiring a shared multiplexer abstraction first.
- A simple parity checklist is sufficient to make applicability decisions durable without a larger comparison specification.

**Risks**

- Herdr is moving quickly, so documentation or researched command shapes may differ from the installed runtime. Implementation must treat installed command help and `herdr api schema --json` as runtime authority.
- Similar-looking cmux and Herdr operations may differ in targeting, lifecycle, or presentation semantics; direct translation could produce unsafe focus-dependent behavior or an unnatural Herdr UX.
- The selected final workflow PR combines five related dispatch/open workflows; shared ns orchestration should keep it coherent, but an unexpectedly broad diff or validation coupling may still force escalation rather than an unapproved stack split.
- Premature extraction of shared orchestration could hide vendor-specific semantics and deepen the wrong module boundary.
- Requiring full `just` for every slice may expose unrelated baseline failures; autonomous execution must stop rather than commit red work or silently weaken the gate.

## Open Questions

No product or execution-policy questions remain. Private implementation mechanics may be resolved autonomously within the Runner Policy; contradictions in the installed Herdr surface are escalation triggers.

## Closure

Completed as a validated, local-only three-branch Graphite stack:

1. `herdr-capability-parity-pr1` publishes the parity checklist and retires the three rejected cmux surfaces and their managed skill.
2. `herdr-capability-parity-pr2` establishes the `core` + `pi` Herdr capability and explicit caller-workspace Objective label.
3. `herdr-capability-parity-pr3` delivers the five selected dispatch/open-branch workflows with fake-driven scenarios and pinned CLI adapter behavior.

Targeted package gates and full `just` pass for the completed stack. No branch or PR was pushed or submitted. Objective/slot/branch metadata reporting is an accepted parked follow-up because the installed Herdr CLI lacks `workspace report-metadata`; the delivered Objective command labels the explicit caller workspace without inventing a substitute transport.
