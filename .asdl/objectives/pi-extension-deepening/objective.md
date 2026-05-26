# Pi Extension Deepening

## Thesis

ASDL's project-local Pi extension ecosystem should become safer, easier to test, and easier for future agents to navigate by deepening the Modules that have proven leverage. The desired outcome is not another architecture review; the desired outcome is deeper extension Modules whose Interfaces concentrate Pi host facts, command execution semantics, presentation rules, Branch Memory and Objective CLI contracts, runner subagent behavior, and risky Graphite/GitHub workflows where the deletion test shows real value.

This Objective supersedes `pi-extension-architecture-deepening`. The earlier Objective documented the vibecoded extension layer vs engineered layer and landed some initial deepening work. This replacement keeps that context, adds the broader architecture assessment from the TypeScript extension review, incorporates the latest `objective list` changes on `master`, and exists to sort which opportunities should be implemented, rejected, parked, or split into follow-on Objectives.

## Scope

In scope:

- Project-local Pi extension discovery adapters and vibecoded extensions under `.pi/extensions/`.
- Engineered TypeScript extension code and tests under `ts/packages/pi-extensions/`.
- Repo-specific Pi documentation under `docs/pi/` when it records extension-layer conventions, runner subagent contracts, cwd semantics, or message rendering policy.
- The TypeScript Objective extension's consumption of `objective list` output, especially after the `master` changes that replaced `ahead_base` with `parent_branch` and `slice_commits`.
- Refactors that improve Module depth, locality, leverage, fake-driven tests, command execution safety, and AI navigability for Pi extension workflows.
- Explicit triage of every candidate in `assessment.md`: implement, reject with reason, park with rationale, or split out.

Inherited context from the superseded Objective:

- `.pi/extensions/*.ts` and `.pi/extensions/*/index.ts` are the vibecoded extension layer: fast repo-local experiments that should stay close to Pi's auto-discovery surface while their shape is still changing.
- `ts/packages/pi-extensions/` is the engineered layer: durable behavior that earns tests, fake adapters, shared modules, and package-level validation.
- Promotion should be driven by stability, risk, reuse, or test need, not by the mere fact that an extension is checked in.
- The already-landed `command-runtime.ts` seam is intentionally narrow: result normalization, command display formatting, terminal escape stripping, output tailing, and output-section formatting belong in shared pure helpers; broader command orchestration and presentation should move only if another deletion-test-backed seam appears.
- The Objective command selection work kept the grouped changed-Objective picker and added shared cross-command characterization tests, while leaving selection logic inline because a clearer pure Module did not emerge.

Fresh assessment context:

- The detailed evidence and candidate list are in `assessment.md` next to this Objective record. It records which docs, source files, tests, and commands were inspected, plus how each candidate was identified using the deletion test and the architecture vocabulary of Module, Interface, Seam, Adapter, Depth, Locality, and Leverage.
- After the user's `git pull`, `objective list` on `master` now reports `max slice commits`; JSON branch entries use `parent_branch` and `slice_commits`; and the Python Objective-list implementation is already split into deeper Modules for models, rendering, status projection, inventory, branch slices, touches, and update attribution. The TypeScript parser has already moved to `parentBranch` and `sliceCommits`, Candidate 11 added a focused regression test rejecting legacy `ahead_base` branch fixtures, and `bun run --cwd ts check` plus `bun run --cwd ts test` pass.
- `/submit` has now been promoted into the engineered TypeScript package with a thin `.pi/extensions/submit.ts` discovery adapter, a `/submit`-specific fakeable runner seam, and characterization tests for the high-risk Graphite/git paths. This completes the accepted Candidate 10 implementation slice and gives Candidate 2 enough evidence to keep broad command-runtime work parked.

## Non-Goals

- Do not force every project-local extension into the engineered package just because it is checked in.
- Do not remove the vibecoded extension layer; it remains valuable for quick repo-specific workflow experiments.
- Do not redesign Pi core, Pi package loading, or the Objective system as part of this Objective.
- Do not turn Objective tracking into hidden state, a registry, a task database, or an implementation state machine.
- Do not delete the superseded Objective's checked-in history; it is closed with a Closure Marker instead.
- Do not automatically submit, land, restack, or mutate Graphite/GitHub state as a side effect of this architecture work.
- Do not re-litigate already-landed `objective list` Python modularization unless TypeScript extension integration reveals new friction.
- Do not extract shared helpers merely to reduce duplicated lines; use the deletion test and prefer depth over shallow pass-through Modules.

## Completion Criteria

This Objective can close when all of the following are true:

- `pi-extension-architecture-deepening` is closed as superseded, with closure context pointing here.
- `assessment.md` exists and preserves the evidence behind the current candidate list, including the post-pull `objective list` facts.
- Each candidate in `assessment.md` has a recorded disposition: implemented, rejected with reason, parked with rationale, or split into a follow-on Objective.
- Accepted refactors remaining in this Objective are implemented with appropriate fake-driven or scenario tests.
- Relevant validation passes after accepted TypeScript changes, at minimum `bun run --cwd ts check` and `bun run --cwd ts test`; broader repo validation is run when Python, docs, or repo-wide behavior changes require it.
- Documentation under `docs/pi/` or Objective prose is updated when decisions change the durable extension-layer model.
- A human explicitly agrees that the Objective outcome has been reached.

## Assumptions and Risks

Assumptions:

- The replacement slug `pi-extension-deepening` is the durable identity the user wants because it names the outcome, not the triage process.
- Closing the old Objective is the correct interpretation of “remove the old one”; deleting checked-in Objective history would violate Objective system conventions.
- The architecture vocabulary from the deepening review is useful for this work: Modules should be deep, the Interface is the test surface, and new Seams should be introduced only when they create real leverage.
- The latest Objective-list changes on `master` are the current ground truth: `slice_commits` and `parent_branch` are the intended branch-entry fields, and Python Objective-list modularization has already addressed some architecture friction in that area.
- The TypeScript extension package remains the right engineered home for durable project-local Pi extension behavior.
- `planned-branch-layer-deepening` owns planned-branch domain policy; this Objective's Branch Memory CLI Adapter candidate may own only generic CLI discovery/execution plumbing when that creates shared leverage.
- The old `@mariozechner/pi-coding-agent` imports in vibecoded extensions were drift against the current `@earendil-works/pi-coding-agent` docs; Candidate 10 reviewed this drift, fixed kept vibecoded `/land`, and then removed `/submit` from the vibecoded layer by promoting it behind a thin adapter.

Risks:

- The candidate list is broad enough to sprawl. The roadmap must force explicit disposition before implementation expands.
- Premature extraction could create shallow Modules whose Interfaces are nearly as complex as their Implementations. Candidate 6 confirmed this risk: the shared terminal helper Module is useful for security-sensitive URL/OSC policy, but the attempted worktree-status message-renderer expansion was removed because it was a separate behavior change rather than helper consolidation. Candidate 4 refined the Branch Memory command boundary around CLI discovery and candidate fallback. Candidate 3 then proved a narrow Machine-envelope parser: framework JSON parsing, `exit_code`, diagnostics, and `data` extraction are shared, while Objective-list fields, Branch Memory `put` fields, and Branch Memory status-entry validation remain caller-local. Candidate 5 accepted the same constraint for Pi skill expansion: command provenance, Markdown reading, frontmatter stripping, base-directory fallback, and block formatting are shared, while Objective selection, `/just` failure policy, notifications, and prompt dispatch remain caller-owned. Candidate 11 confirmed the same pattern for Objective integration: `objective-list.ts` and `objective-picker.ts` earn their keep, Machine-envelope reuse is sufficient, and broad `objective.ts` extraction stays parked.
- The risky extensions, especially `/submit`, touch Graphite and GitHub workflows; changes there require the relevant Graphite and GitHub guidance and careful fake-driven tests. Candidate 10 accepted and implemented `/submit` promotion to the engineered layer, kept `/land` as a vibecoded fast path for non-Graphite users, and kept `/just` vibecoded now that shared skill expansion is extracted. Candidate 1 rejected a broad Pi host seam before `/submit` promotion; the implemented `/submit` tests use local host stubs plus a domain-specific Graphite/git runner fake rather than a maintained generic FakePi host.
- Candidate 8 confirmed `/land-stack` is already a deep safety-critical Module with useful internal stage Modules. Broad production refactor remains parked; the accepted change was only to shrink the shallow top-level test-only export Interface by importing helper tests from canonical internal Modules. The substantial scenario tests and command choreography assertions remain intentional safety evidence for Graphite/GitHub mutations.
- `worktree-status.ts` mixes session lifecycle, watchers, Git facts, Branch Memory facts, Graphite facts, and rendering. Candidate 7 accepted this risk rather than refactoring now: the current status command is project-local/vibecoded, and any status feature shipped to users should likely have a different product shape instead of inheriting this implementation. Further worktree-status seam work remains parked unless a concrete local bug or future product surface justifies characterization tests first.
- Branch Memory Adapter work could accidentally absorb planned-branch workflow policy; keep planned-branch namespace/key semantics, fatal diagnostics, and planning-level presentation in the planned-branch layer.
- Runner subagent terminology had drifted in docs and code from child-session naming; Candidate 9 de-risked the current guidance by labeling `runChildSession(...)` as historical, documenting final-text vs terminal-capture mode separately, and adding a small shared presentation helper. Future Objective-stack work should keep using the runner-subagent vocabulary.
- The new Objective may duplicate old completed work unless roadmap items distinguish inherited context from still-open decisions.

## Open Questions

- Should buffered `/submit` subcommands later move to `pi.exec` once tests can prove no diagnostic or UX regression?
- Should `/submit` PR-link extraction or OSC notification formatting move into `terminal-presentation.ts`, or is the current local behavior still more appropriate?
- What future concrete consumer, if any, would prove that the `/submit` runner seam should become a broader command execution Module?
- How should the new skill-expansion helper evolve if future skill handoffs appear, without becoming a generic Markdown or prompt-dispatch utility?
