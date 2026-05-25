# Planned Branch Layer Deepening

## Thesis

The planned-branch planning system should become a clear planning-layer Module stacked on top of Branch Memory, not an implementation that feels integrated into Branch Memory itself.

The user-facing Interface is already close to the desired shape: `/write-plan` creates a saved plan in the local plan store, `/create-planned-branch` creates an implementation branch and attaches that plan, and `/impl-planned-branch` loads the attached plan to start work. This Objective exists to deepen the implementation behind that Interface so planning concepts own the workflow and Branch Memory appears only as a lower storage Adapter at an explicit attachment Seam.

The desired outcome is better locality and leverage: naming, docs, tests, and deterministic read/write behavior should concentrate around saved plans, planned branches, and attached plans. Branch Memory should remain a generic primitive for branch-scoped text storage rather than carrying planned-branch policy.

## Scope

In scope:

- The project-local Pi extension shim at `.pi/extensions/create-brmem-plan-branch.ts`.
- The engineered planning implementation and tests under `ts/packages/pi-extensions/`, especially:
  - `src/create-brmem-plan-branch.ts`
  - `src/brmem-plans/plan-branch.ts`
  - `src/brmem-plans/plan-persistence.ts`
  - `src/brmem-plans/source-plan-file.ts`
  - `test/create-brmem-plan-branch.test.ts`
  - `test/brmem-plan-branch.test.ts`
- The `/write-plan`, `/create-planned-branch`, and `/impl-planned-branch` slash-command behavior, while keeping those slash-command names stable unless the user explicitly decides otherwise later.
- Internal module, file, type, helper, doc, and skill naming that still makes Branch Memory appear to be the planning domain rather than a lower Adapter.
- The local plan store contract at `~/.asdl/plans/<repo>/<encoded-source-branch>/<slug>.md`, including slug validation, source-branch directory resolution, newest-plan selection, and exclusive writes.
- The planned-branch attachment contract: attach the selected saved plan to the implementation branch in Branch Memory namespace `brmem-plans` with key `<slug>.md`.
- A tested attached-plan reader for the `/impl-planned-branch` path, replacing deterministic branch checks, key selection, `brmem list`, and `brmem get` rules currently living primarily in skill prose.
- Skill and prompt ownership for `/impl-planned-branch`: the former `brmem-plan-impl` discovery surface, its install layout, and the extension-owned Markdown prompt that replaces it.
- Documentation placement: move planned-branch workflow policy out of `packages/brmem/README.md` into the planning/Pi extension documentation surface, leaving the brmem README focused on Branch Memory as a generic primitive with at most a concise pointer.
- Focused fake-driven TypeScript tests and relevant Markdown formatting checks for any touched code or docs.

## Non-Goals

- Do not redesign Branch Memory storage semantics, refs, namespaces, Entry Keys, or the `brmem` CLI itself.
- Do not make this Objective own a generic Branch Memory CLI Adapter for every Pi extension. A small Adapter may be introduced where the planned-branch layer needs it, but broader shared `brmem` reuse remains a separate decision, likely under `pi-extension-deepening` or a follow-on Objective.
- Do not rename the user-facing slash commands `/write-plan`, `/create-planned-branch`, or `/impl-planned-branch` without a later explicit user decision.
- Do not integrate this workflow with Objectives, checked-in plan records, hidden registries, task databases, or workflow-control state machines.
- Do not add automatic PR submission, stack landing, or publishing behavior to planned-branch creation.
- Do not force every Pi extension deepening candidate into this Objective; this Objective is the split-out planning-layer slice only.
- Do not hide all Branch Memory diagnostics. The planning Interface should be primary, but failures still need enough lower-level evidence to recover from partial branch creation or storage errors.

## Completion Criteria

This Objective can close when all of the following are true:

- The planning-layer vocabulary is explicit in code and docs: saved plans, planned branches, attached plans, local plan store, and Branch Memory Adapter have clear roles.
- The main engineered module names and exported Interfaces no longer make Branch Memory appear to be the whole planning domain; Branch Memory-specific code is isolated behind an attachment/storage Seam.
- The local plan store Module stands apart from Branch Memory persistence. Legacy or deprecated direct Branch Memory plan-storage paths are deleted, parked with rationale, or isolated so they no longer confuse the planning Interface.
- `/create-planned-branch` presents planning-level preview and success evidence first, while preserving lower-level Branch Memory diagnostics where they are needed for recovery.
- `/impl-planned-branch` has a tested deterministic attached-plan reader covering branch safety, canonical namespace listing, key selection, missing entries, multiple entries, and loading the selected plan content.
- The former `brmem-plan-impl` skill is no longer a discoverable workflow surface; `/impl-planned-branch` owns deterministic loading and injects implementation guidance from extension-owned Markdown.
- Planned-branch workflow docs live next to the planning/Pi extension layer, while `packages/brmem/README.md` remains focused on Branch Memory concepts and commands with at most a concise pointer to the higher-level workflow.
- Focused validation passes for touched TypeScript and docs, at minimum `bun run --cwd ts check`, relevant `bun run --cwd ts test` coverage, and `just dprint-check` when Markdown/TOML changes are made.
- Any overlap with `pi-extension-deepening` is resolved by an explicit update, disposition, or cross-reference rather than silent duplication.
- A human explicitly agrees that the planned-branch layer is deep enough and the Objective can close.

## Assumptions and Risks

Assumptions:

- `planned-branch-layer-deepening` is the right durable slug because it names the intended architectural outcome rather than the old `brmem` implementation naming.
- This Objective is intentionally split out from the broader open `pi-extension-deepening` Objective because the planned-branch workflow needs focused treatment.
- Branch Memory is the correct lower storage Adapter for attached plans; the architecture problem is not that Branch Memory is used, but that current naming, docs, and read-path behavior make the planning layer look integrated with it.
- The stable slash-command Interface is already useful and should remain centered on planning terms.
- A tested attached-plan reader plus extension-owned Markdown prompt can preserve the useful behavior formerly carried by `brmem-plan-impl` while eliminating a confusing discoverable skill surface; current evidence confirms this for branch safety, key selection, attached-plan loading, prompt injection, and implementation guardrails.
- The local plan store path convention remains the right pre-branch place for reviewed plans created by `/write-plan`.

Risks:

- The overlap with `pi-extension-deepening` is resolved by layer ownership: this Objective owns planned-branch domain policy and focused attached-plan read/write seams, while `pi-extension-deepening` may later own generic Branch Memory CLI discovery/execution plumbing for `worktree-status` or future consumers.
- Over-correcting the naming could hide important recovery evidence. Partial failures may create a branch before Branch Memory attachment fails, and users still need precise diagnostics.
- If a future generic Branch Memory Adapter lands under `pi-extension-deepening`, it must preserve planned-branch caller policy: fatal attachment/read diagnostics, planning-level vocabulary, and the `brmem-plans` namespace/key contract stay local to planned-branch code.
- Skill cleanup no longer depends on a rename: the repo-local `brmem-plan-impl` source, `.agents`/`.claude` symlinks, lockfile entry, and installer references have been removed. The residual caveat is that already-running Pi sessions may still have startup-loaded skill context until reload or a new session.
- Graphite branch creation remains repo-specific policy. Changes must respect the runtime Graphite dependency boundary and keep Graphite usage behind explicit planned-branch configuration or command semantics.
- The docs-relocation discoverability risk is mitigated by `docs/pi/planned-branch-workflow.md`, its `docs/pi/README.md` index link, and a concise `packages/brmem/README.md` pointer; future command-help improvements are optional rather than required for this Objective.

## Open Questions

- What should the final engineered module path and exported names be: `planned-branch`, `planning`, `saved-plans`, or another planning-layer term?
- Which Branch Memory details should remain in normal success output, and which should move to diagnostics for failure or expanded evidence?
- Answered: generic Branch Memory CLI Adapter work belongs to `pi-extension-deepening` as shared CLI plumbing, not to this Objective; planned-branch closure does not wait on generic Adapter extraction.
- Answered: durable planning workflow documentation now lives in `docs/pi/planned-branch-workflow.md`, linked from `docs/pi/README.md`, with a concise pointer from `packages/brmem/README.md`; command help expansion can remain optional follow-up work.
