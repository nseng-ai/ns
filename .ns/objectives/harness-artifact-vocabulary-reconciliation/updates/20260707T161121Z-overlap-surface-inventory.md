# Overlap-surface inventory for the vocabulary reconciliation sweep

## Summary

Source-backed inventory of every doc, skill, CONTEXT file, and code identifier where the old and new skill/artifact vocabularies or workflows meet, per the roadmap's inventory-first rule. Each item carries a disposition: **rename**, **update**, **preserve-historical** (leave as-is, optionally with a clarifying note), or **out-of-scope with rationale**. Anything not listed here needs a recorded reason before the sweep touches it.

Evidence basis: `rg` sweeps for `managed artifact`, `skillx`, `npx skills`, `ns skills`, `harness artifact`, and vocabulary terms across `docs/`, `skills/`, `.agents/skills/`, `ts/packages/`, `CONTEXT.md`, and `CONTEXT-MAP.md` on branch `update-parked-breadth-dispositions` (2026-07-07).

### A. AREG "managed artifacts" collision — disposition: rename (pending term settlement)

Live, localized occurrences of the colliding overlay sense inside the tool re-read as Artifact Registry:

- `ts/packages/tools/areg/src/operations/skill-kind.ts:134` — `--yes` flag description: "Approve deletion prompts for managed artifacts."
- `ts/packages/tools/areg/src/operations/skill-kind.ts:200` — `skill apply` long description: "Apply the managed artifacts for a skill invocation kind. This reconciles managed artifacts…"
- `ts/packages/tools/areg/src/operations/skill-kind-apply-plan.ts:419` — deletion confirmation prompt string: "…will delete managed artifacts:".
- `ts/packages/tools/areg/test/scenario/skill-apply-cli.test.ts:132` — test name "normal requires confirmation before deleting managed artifacts".
- `docs/conventions/skill-conventions.md:19` — kinds table column header "Managed artifacts" (and the same section's prose "invocation-kind overlay files", which already uses the target concept informally).

All are user-facing strings, prose, or test names — **no machine-readable identifier** (flag name, error code, JSON key) carries the phrase, so the rename is purely textual; nothing to flag as a breaking machine-facing rename so far.

Not part of the rename (same phrase, different or historical sense):

- `docs/conventions/consumer-gateways-and-command-shape.md:9` — "write a managed artifact" as a generic gateway-operation example, not AREG's overlay sense. Disposition: **update** (reword to a non-colliding example such as "write a provisioned harness artifact" or a different domain example) since it is a live convention doc.
- `docs/retros/internal-pr-stack-address-retrospective.md:502` and `docs/retros/cli-surface-conformance-audit.md:197` — retros. Disposition: **preserve-historical** (retros are point-in-time records; the audit line cites `skill-kind.ts` line numbers already drifted).

### B. Residual `skillx` references — disposition: split

`skillx` (the deleted npx-wrapping workspace gateway) appears in:

- `skills/python-fake-driven-test-layout/SKILL.md:156-157` — uses `test_skillx.py` / `skillx.py` as a *layout example*. Disposition: **update** — swap to a non-dead example module name; the skill is live guidance, not history.
- `ts/packages/internal/pi-tools/test/backing-skill-commands/backing-skill-commands.test.ts:81,119` — asserts `skillx` is *absent* from command-backed surfaces. Disposition: **update** — these are guard assertions against a now-nonexistent name; either retitle to explain they guard the historical removal, or replace with a clearly-fictional name. Behavior-neutral.
- `ts/packages/tools/areg/test/scenario/cli-shape.test.ts:36` — asserts areg help does not contain `skillx`. Disposition: **update** (same guard-assertion treatment).
- `docs/retros/cli-surface-conformance-audit.md` (rows 79, 114, 150, 200-205, 628) — audit of the then-live `areg exec skillx` surface. Disposition: **preserve-historical**; add one clarifying note near the top only if judged actively misleading (the doc audits commands that no longer exist, including the also-removed `areg update-skills`).

### C. Two-channel positioning docs — disposition: update

Neither of the two canonical skill-workflow documents mentions `ns skills`, `ns update`, provisioning, or the install manifest at all:

- `docs/conventions/skill-conventions.md` — "Managing Skills With `npx skills`" section presents `npx skills` + `areg` as the complete management story. Needs the additive two-channel framing: `ns skills` / `ns update` for first-party npm-module-bundled provisioning; `npx skills` for third-party acquisition; AREG as whole-project inspector over both records (`skills-lock.json` and `.ns-harness-artifacts-manifest.json` are complementary by decision, not convergence candidates). Also owns the "Managed artifacts" column-header rename (item A).
- `skills/skill-management/SKILL.md` (+ `references/commands.md`) — canonical `npx skills` reference; first-party under `skills/<name>/` is described as edited-in-place only. Needs a short positioning note that first-party provisioning to harness roots is `ns skills install` / `ns update` territory, and that this skill covers the third-party channel. This is a **first-party skill** (real directory under `skills/`, symlinked into `.agents/skills/`), so the objective's open question about editing vendored skills does not apply — it can be edited in place. Resolves that open question.
- `docs/research/harness-skill-invocation.md` — the "verify additivity in prose" scope item: contains zero mention of `ns skills`/`ns update`/provisioning. Disposition: **update minimally** — it is research provenance for the invocation-kind taxonomy; add only a short pointer that first-party provisioning now materializes skills into the harness roots this doc describes, without asserting unverified harness behavior (Runner Policy steer-first boundary).
- `docs/agents/matt-pocock-skills.md` — third-party vendored-skill workflow; already consistent with the `npx skills` channel and already warns off removed `areg update-skills`. Disposition: **leave**, verify only.

### D. CONTEXT.md / CONTEXT-MAP.md alignment — disposition: update (bounded)

- Root `CONTEXT.md` — has no harness-artifact vocabulary cluster; "harness" appears only in the unrelated **Runtime Harness** term (`CONTEXT.md:188`). Per CONTEXT-MAP, `@nseng-ai/areg` is a *Planned* context whose sketch already uses "invocation-kind overlays" — consistent with the working replacement term. Disposition: add the decided harness-artifact terms (harness artifact, provision, harness, skills; `Avoid`: bare "artifact" where ambiguous, "platform" for harness) at the root or as part of the planned areg/harness-artifacts context entry — smallest change that gives agents binding `Avoid` entries; do **not** author the full planned `@nseng-ai/areg` context here (repo-ontology objective owns planned-context authoring; keep this slice to the vocabulary terms this objective decided).
- `CONTEXT-MAP.md` "Skill / agent / resource" flagged ambiguity — this sweep partially resolves it; update the flagged-ambiguity line to reflect the settled two-channel + kind-overlay vocabulary.
- `ts/packages/capabilities/handoffs/CONTEXT.md` — Handoff Artifact terms stay owned by that domain (objective non-goal). Disposition: **leave**; at most confirm its `Avoid` lines don't claim the bare word "artifact" repo-wide.
- `ts/packages/capabilities/harness-artifacts/README.md` — already uses the decided vocabulary (harness artifact / provision / skills / manifest). Disposition: **leave**, cite as the vocabulary exemplar.

### E. Already-consistent code surfaces — disposition: leave (verified)

`@nseng-ai/harness-artifacts` sources/tests (`artifact-catalog.ts`, `module-artifact-declaration.ts`, `module-artifact-discovery.ts`, `reconcile.ts`, `provision-*.ts`, `skills-lockfile.ts`) and AREG's manifest-source findings (`manifest-source-findings.ts`) uniformly use harness-artifact vocabulary. No changes.

## Objective Impact

- The roadmap's first Work row (overlap inventory with per-item dispositions) is satisfied by this update; the sweep is now bounded to items A–D.
- De-risks the "sweep creep" risk: the boundary rule is operative — anything outside this inventory needs a recorded reason.
- Resolves one Open Question: `skill-management` is a first-party skill (canonical `skills/skill-management/`), so it is edited in place; the vendored-code boundary is not implicated.
- Sharpens the rename slice: no machine-facing identifiers carry "managed artifacts", so the AREG rename is textual-only once the replacement term is settled.

## Follow-Ups

- Settle the replacement term (working candidate "kind overlays"; the Planned `@nseng-ai/areg` context sketch in `CONTEXT-MAP.md` already says "invocation-kind overlays" — consider "invocation-kind overlays" long-form with "kind overlays" as the short form) before the mechanical rename pass.
- Decide how small the CONTEXT change can stay (root vocabulary terms vs. waiting for the planned areg context) without stepping on the `repo-ontology` objective's planned-context authoring; coordinate if it grows.
- Execute slices in roadmap order: rename → two-channel docs → skillx sweep → CONTEXT alignment; full `just` after code-touching slices.
