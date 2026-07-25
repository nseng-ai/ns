# Roadmap

## Work

- [x] Cut over to the exact Herdr implementation catalog
  - Register `/ns:herdr:impl:prompt:space`, `/ns:herdr:impl:plan:space`, and `/ns:herdr:impl:plan:tab` alongside the six direct space/tab operations.
  - Remove former `launch`, branch-basis-specific `br`/`tr`, workflow-family, compound dispatch, and cmux names without visible or hidden aliases.
  - Preserve eight base registrations plus optional `/ns:herdr:tab:handoff` for exactly nine commands.

- [x] Establish responsible implementation-attempt semantics
  - Prompt implementation instructs the launched agent to inspect the supplied prompt and repository, implement when valid, and otherwise stop with a concrete blocker or clarification request.
  - Plan implementation launches the Attached Plan implementation workflow under the same responsibility boundary.
  - Keep Prepared Herdr Launch, destination/process startup, Pi launch mechanics, `ns-launch` prompt transport/storage, and Handoff launch as accurate supporting vocabulary rather than user-facing implementation outcomes.

- [x] Preserve contextual implementation branch selection
  - Share one current-branch/local-trunk policy across prompt-to-space, plan-to-space, and plan-to-tab implementation.
  - Preserve named-trunk behavior, explicit interaction, cancellation and noninteractive failure ordering, current-branch revalidation, exact local-trunk SHA use, no fetch or refresh, tab caller preflight, and plan dry-run semantics.
  - Preserve Branch Context ownership of plan attachment, explicit start point/parentage, deterministic collision selection, and race revalidation.

- [x] Retain direct resources and Handoff composition
  - Keep `space:{new,goal,objective-summary}` and `tab:{new,goal,handoff}` with exact caller space/tab targeting and semantic labels.
  - Keep `tab:handoff` conditional on the Handoffs integration and retain the hidden reference-based Handoff launch command.
  - Keep cmux and standalone Herdr open-branch implementation absent.

- [x] Reconcile current documentation and Objective state
  - Update Herdr and Pi contexts, the Context Map, Pi guidance, and the exact command catalog.
  - Rename the predominantly current catalog from `cmux-parity-checklist.md` to `command-catalog.md`, preserve migration history in prose, and update live inbound links.
  - Preserve historical ADRs, research, retrospectives, planning references, docs-site, and all existing immutable Semantic Updates.
  - Evidence: implementation validation supplied before this documentation slice passed Vitest (12 files, 149 tests), targeted Vitest (4 files, 58 tests), `just ts-check`, `just ts-format-check`, and `git diff --check`. The current Semantic Update records code/test anchors and the exact catalog.

## Parked

- Herdr event subscriptions, agent waits, declarative layouts, plugins, and raw socket/generated protocol integration remain outside this Objective until a concrete workflow requires them.
- A public generic Herdr workspace-summary command remains parked pending a separate concrete consumer and installed runtime support.
- Tab prompt implementation remains outside this Objective.
- Objective closure remains blocked by the unrelated immutable legacy-update checker incompatibility; no `closed.md` is added.
