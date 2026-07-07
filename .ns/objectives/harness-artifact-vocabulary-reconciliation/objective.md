---
edges:
  - objective: skill-management-subsystem
    annotation: Subobjective of that umbrella; graduated 2026-07-07 from the parked "reconcile with existing skill workflows, docs, and vocabulary" row. Owns the docs/vocabulary reconciliation sweep and the bare-"artifact" collision cleanup; the umbrella coordinates the reusable-subsystem ambition and remaining deferred breadth.
---

# Harness-Artifact Vocabulary and Skill-Workflow Reconciliation

## Thesis

The harness-artifact subsystem (`@nseng-ai/harness-artifacts`, `ns skills`, `ns update`, the install manifest) landed on top of an ecosystem that already had skill workflows and vocabulary: the `npx skills` third-party toolchain and its canonical in-repo reference skill, `docs/conventions/skill-conventions.md`, the `@nseng-ai/areg` inspector's own "managed artifacts" term, residual `skillx` references, and domain `CONTEXT.md` files that predate the **harness artifact** vocabulary decision. This Subobjective reconciles them: every doc, skill, and code-facing name should tell one coherent story in which the new CLI behavior is *additive* — first-party npm-module-bundled provisioning via `ns` alongside third-party acquisition via `npx skills` — and the decided vocabulary (harness artifact / skills / provision / harness) is used consistently.

It includes the **bare-"artifact" collision cleanup**, a documented umbrella risk: "artifact" is used by three domains — handoff artifacts (`@nseng-ai/handoffs`), consumer artifacts (`docs/conventions/platform-and-consumer.md`), and AREG's "managed artifacts" for invocation-kind overlay files. The first two stay owned by their domains; AREG's overlay sense is renamed to **harness overlays**, and "harness artifact" is the canonical qualified term wherever ambiguity exists.

This is a **bounded execution Subobjective** under the `skill-management-subsystem` umbrella — documentation-, vocabulary-, and rename-heavy, with small mechanical code renames but no provisioning behavior change.

## Starting state (source-grounded)

- **Vocabulary is decided but unevenly applied.** The umbrella decided (update `20260702T035321Z`): domain term **harness artifact** (kinds `skill`/`agent`/`extension-bundle`), user-facing **skills**, verb **provision**, **harness** not "platform", AREG re-read as **Artifact Registry**. The new packages use it; older docs and CONTEXT files do not uniformly.
- **AREG's colliding term is live and localized.** "Managed artifact(s)" appears in `ts/packages/tools/areg/src/operations/skill-kind.ts` and `skill-kind-apply-plan.ts` (plus `test/scenario/skill-apply-cli.test.ts`) for invocation-kind overlay files — a direct collision inside the tool re-read as Artifact Registry.
- **`npx skills` remains the sanctioned third-party channel.** The umbrella retired all wrapping/replacement of it; AREG's npx-wrapping surfaces were removed by the `npm-bundled-artifact-provisioning` child, leaving AREG a standalone whole-project inspector. `.agents/skills/skill-management/SKILL.md` is the canonical `npx skills` reference and predates `ns skills` entirely.
- **`docs/conventions/skill-conventions.md`** governs first-party skill authoring/installation and predates `ns skills install` / `ns update` provisioning.
- **`skillx` is dead but referenced.** The skillx workspace gateway was deleted with the npx-removal; residual mentions remain in `skills/python-fake-driven-test-layout/SKILL.md`, `docs/retros/cli-surface-conformance-audit.md`, `ts/packages/internal/pi-tools/test/backing-skill-commands/backing-skill-commands.test.ts`, and `ts/packages/tools/areg/test/scenario/cli-shape.test.ts`.
- **Two complementary records exist by decision**, not accident: `skills-lock.json` (npx skills) and `.ns-harness-artifacts-manifest.json` (ns provisioning). AREG inspects both; docs should say so rather than imply one true record.

## Scope

- **Inventory the overlap surface** first: every doc, skill, CONTEXT.md, and code identifier where the old and new skill/artifact vocabularies or workflows meet. The inventory bounds the sweep; record it as a Semantic Update before renaming.
- **Rename AREG's "managed artifacts" overlay sense** to **harness overlays** across operations, tests, and user-facing strings; flag any machine-facing name changes explicitly.
- **Update `docs/conventions/skill-conventions.md`** and the `skill-management` skill so they position the two channels accurately: `ns skills` / `ns update` for first-party npm-module-bundled provisioning; `npx skills` for third-party acquisition; AREG as the whole-project inspector over both records.
- **Sweep residual `skillx` references** in skills, retros, and tests to reflect its deletion.
- **Align domain `CONTEXT.md` files** (per `CONTEXT-MAP.md` routing) with the harness-artifact vocabulary, including `Avoid` entries for the retired/colliding terms (bare "artifact" where ambiguous, "platform" for harness).
- **Verify additivity in prose**: harness skill-invocation docs should describe how provisioned skills are actually discovered by pi/claude-code/codex, consistent with what `ns update` provisions.

## Non-Goals

- No provisioning behavior changes; this record edits names, docs, and vocabulary, not reconcile/apply semantics.
- No `npx skills` wrapping/replacement and no `skills-lock.json` / install-manifest convergence (both retired umbrella dispositions; this sweep documents the complementary-records reality).
- No renaming of handoff artifacts or consumer artifacts — those domains own their terms.
- No new terminology inventions beyond settling the overlay rename; where a genuinely new term seems needed, stop and record the question instead.
- Historical records (retros, closed Objectives, past updates) are not rewritten; only add clarifying notes where a stale reference would actively mislead.

## Completion Criteria

- An overlap inventory exists as a Semantic Update and every inventoried item has a disposition (updated, renamed, deliberately left with rationale).
- `rg -i "managed artifact"` under `ts/packages/tools/areg` returns nothing; the overlay concept has one new name used consistently in code, tests, and output strings.
- `skill-conventions.md`, the `skill-management` skill, and affected CONTEXT.md files tell the additive two-channel story with the decided vocabulary and appropriate `Avoid` entries.
- Residual `skillx` references outside deliberately-preserved historical records are gone.
- Full `just` green (main suite, style guard, tsgo, edge sweep `sweep-ok`).

## Definition of Progress

Keepable progress advances the inventory or a disposition slice with docs/renames consistent with the decided vocabulary and passing validation. Do not keep changes that alter provisioning behavior, invent unrecorded terminology, or rewrite historical records wholesale.

## Runner Policy

- **Direct execution allowed when:** the slice is inventory work, doc/CONTEXT updates within the decided vocabulary, the mechanical overlay rename, or `skillx` reference cleanup — with passing validation and machine-facing renames flagged.
- **Steer or ask first when:** a slice would coin a new domain term, change a machine-readable identifier consumed outside AREG, restructure `skill-conventions.md` beyond the two-channel positioning, or touch harness-invocation docs in ways that assert unverified harness behavior.
- **How work may change files:** local edits only, committed per slice on a feature branch (never `main`/`master`); clean tree and green validation per step.
- **Will not happen unless explicitly requested:** pushing, PR creation/submission, publishing, or any external write-capable action.

## Assumptions and Risks

Assumptions:

- The overlay rename is mechanical once the replacement term is settled; no AREG consumer depends on the phrase "managed artifacts" outside the repo.
- The two-channel story (ns provisions first-party npm-bundled; npx skills acquires third-party; AREG inspects all) is stable enough to document — it reflects three closed-child outcomes, not in-flight design.

Risks:

- **Sweep creep:** vocabulary sweeps invite unbounded editing. Defend with the inventory-first rule; anything outside the inventory needs a recorded reason.
- **Terminology churn:** the replacement term could force a second rename if chosen hastily. The 2026-07-07 term decision settled **harness overlays** before the mechanical pass.
- **Stale-doc whack-a-mole:** docs drift again after the sweep. Mitigate by putting the vocabulary in CONTEXT.md `Avoid` lists, which agents are bound to honor.

## Open Questions

- ~~Final replacement term for AREG's overlay sense ("kind overlays" is the working candidate; confirm against `CONTEXT.md` conventions before the rename pass).~~ **Resolved 2026-07-07** (update `20260707T163033Z-harness-overlays-term-decision.md`): final term is **harness overlays** because harnesses define the files and the term remains axis-agnostic beyond invocation.
- ~~Whether the `skill-management` skill (vendored under `.agents/skills/`) is edited in place or its positioning note lives in first-party docs only, given the vendored-code review boundary.~~ **Resolved 2026-07-07** (inventory update `20260707T161121Z`): `skill-management` is a first-party skill with canonical source `skills/skill-management/` (`.agents/skills/skill-management` is a symlink), so it is edited in place; the vendored-code boundary is not implicated.

## Closure

Closed 2026-07-07 as completed. The overlap inventory bounded the sweep, AREG's colliding "managed artifacts" overlay sense was renamed to **harness overlays** without machine-facing identifier changes, two-channel skill management prose now explains first-party `ns skills` / `ns update` provisioning alongside third-party `npx skills` acquisition, residual live `skillx` references were removed, and root `CONTEXT.md` now carries the binding harness-artifact vocabulary cluster with Avoid entries for ambiguous bare "artifact", "managed artifact", "platform", and "kind overlays".

Completion evidence: `rg -i "managed artifact" ts/packages/tools/areg` returned no matches; the context slice passed `just dprint-check`; closure validation passed full `just` (including dprint, TypeScript style guard, deps check, oxlint, tsgo, 120 style-guard tests, 4643 main Vitest tests, and objective edge sweep `sweep-ok`); and `ns objective check harness-artifact-vocabulary-reconciliation` plus `ns objective check skill-management-subsystem` passed after the user authorized a narrow legacy-shape repair to add missing required headings to three existing umbrella update files.

The only parked row in this record — pushing areg's remaining local logic (invocation-kind apply planning, `check` drift detection, skill find) down into `@nseng-ai/harness-artifacts` when a second runtime consumer needs it — moved to the `skill-management-subsystem` umbrella roadmap at closure, preserving its trigger and constraints.
