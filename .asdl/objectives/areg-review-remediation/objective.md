# Remediate areg Review Findings

## Thesis

The current areg/skill migration branch should not proceed as merely working code. The review surfaced structural safety, boundary, fake-driven testing, and skill artifact consistency issues that need deliberate remediation. This Objective tracks turning those findings into a cleaner, safer, more maintainable implementation before the branch is considered review-ready.

## Scope

This Objective covers the high-conviction review findings from the thermo-nuclear code quality review:

- Make `areg init` safer and more atomic by separating preflight/planning from mutation, validating managed files before external installs, and avoiding silent destructive `areg.json` overwrites.
- Harden destructive and path-sensitive filesystem operations, including symlink-aware managed writes and canonical validation for `skillx cleanup`.
- Clean up areg's external boundary model so Git/root discovery, host-tool availability, `gh`, and `npx skills` interactions sit behind clear injectable seams instead of ad-hoc global process checks.
- Rework the `NpxSkills` fake/gateway contract or surrounding project-skill store so logic tests are not coupled to filesystem side effects as the default fake behavior.
- Add explicit typed validation for `skills-lock.json` and ensure malformed-but-valid JSON fails with user-facing Click errors rather than incidental Python exceptions.
- Reconcile migrated skill templates and docs with repo conventions, including empty `__init__.py` rules, setup-python CI workflow naming/default-branch behavior, real lockfile hashes, stricter lock validation, and Markdown fence correctness.

## Non-Goals

- Do not redesign the Objective system or introduce task-database/state-machine behavior.
- Do not rewrite the upstream `npx skills` CLI or solve every upstream `skills` limitation.
- Do not perform a broad audit of every skill beyond the concrete review findings unless a fix reveals a directly coupled issue.
- Do not create routine validation-only roadmap work; tests, `areg check`, and repo checks are completion evidence for semantic remediation rows.

## Completion Criteria

- Every blocker and high-confidence finding from the review has either been fixed structurally or explicitly documented as intentionally deferred with a clear reason.
- `areg init` cannot leave predictable half-applied state after local validation failures, and existing config/prose mutation behavior is intentional and tested.
- Destructive path operations reject traversal/symlink escape cases and report clean user-facing errors.
- areg's gateway/fake boundaries are coherent enough that scenario tests exercise business logic through fakes without relying on unrelated global process patching or incidental filesystem mutation.
- Lockfile parsing and skills-management validation enforce the real contract, including rejecting placeholder hashes if placeholders are not an intentional documented state.
- Skill templates/docs no longer contradict repo import rules or generated CI expectations.
- Targeted tests and relevant repo checks pass as evidence for the changed areas.

## Assumptions and Risks

Assumptions:

- A single Objective is the right tracking unit because the findings share one purpose: making the areg migration branch structurally review-ready.
- The intended remediation bar is structural/code-judo cleanup, not a checklist of narrow local patches.
- The current branch can absorb these fixes without reopening the entire nonslop-to-areg migration strategy.
- For `areg init` first-row safety, predictable local validation failures and `npx skills add` failures are sufficient evidence; rollback for arbitrary post-install OS write failures remains outside this row unless a later storage abstraction targets it.

Risks:

- The gateway/fake cleanup may reveal a missing domain abstraction, especially around installed skill trees versus project filesystem state, and could grow beyond a small patch. De-risked for the current areg surfaces: host-tool checks and Git-root discovery have an injectable `AregEnvironment` seam with fake-driven scenario coverage (commit `0470dc19`), and the installed-skill-tree ambiguity is split across two explicit boundaries. `NpxSkills` remains the side-effectful external-command gateway, while the skillx transient-workspace gateway owns inspectable fetched skill trees with a real implementation and a non-I/O fake.
- Making `areg init` more atomic may require deciding whether to preserve, merge, prompt for, or overwrite existing `areg.json`; the wrong default could surprise users. Resolved: `init` now preserves unknown keys from an existing `areg.json` by default rather than overwriting the file, covered by scenario tests (landed commit `a2086b45`).
- Symlink/path hardening can become either too permissive to be safe or too strict for real repos with legitimate symlinked config directories. De-risked for the current remediation slice: managed `areg init` files and `.claude` settings now reject symlinks outright, and `skillx cleanup` validates canonical temp-root containment before deletion. Legitimate symlinked config support remains an intentional future policy decision if users need it.
- Tightening lockfile validation may expose existing repository lockfile debt, including `PENDING_REGEN` placeholders, that must be resolved before CI can enforce the stronger rule.

## Open Questions

- ~~Should tool availability and Git-root discovery be separate gateways, methods on an existing context, or part of a broader project environment boundary?~~ Resolved for the current slice: they live on an injectable `AregEnvironment` carried by `AregContext` (commit `0470dc19`). Broader project skill-state ownership remains open under the boundary-model roadmap row.
- ~~Should `NpxSkills.add` continue to model side-effectful installation, or should it return an installed skill tree while a separate store owns filesystem application?~~ Resolved for the current areg surfaces: production `NpxSkills.add` remains a side-effectful external-command boundary, the default fake records invocations without filesystem mutation, and inspectable transient skill trees are modeled by the skillx workspace gateway.
- ~~Should existing `areg.json` unknown keys be preserved by default, or should replacement require an explicit force/yes path?~~ Resolved: unknown keys are preserved by default; `init` merges the managed `agents` field into the existing object instead of overwriting it (landed commit `a2086b45`).
