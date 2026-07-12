# Layering grilling row resolved: thirteen decisions, ADR 0033, execution spec

## Summary

The "Reexamine extension, host, and kernel layering vocabulary" grilling row resolved
in a live session (2026-07-11). Thirteen ratified decisions are recorded durably as
ADR 0033 (`docs/adr/0033-layering-reshape-tier-projected-directories-and-seam-naming.md`)
and the execution handoff
`docs/wayfinding/ontology-reshape/layering-reshape-spec.md` (ten execution items).
Headliners:

- `ns.tier` is the canonical classification; role directories become a
  style-guard-enforced projection. Ground truth had moved since the sweeps: four
  directory↔tier mismatches, not two (reviews = `standalone-tool` and ns-dev =
  `internal-pi-tool` were new). Dispositions: pi-command-surfaces deleted (zero
  consumers), reviews → `capability`, ns-dev → `internal-tool`, ns-pi-subagents into
  internal space with `@internal` rescope (the `extensions/` role directory dies).
- Tier taxonomy trimmed nine → seven: `capability-pi` deleted (structurally
  unoccupiable under ADR 0032 single-tier packages), `internal-pi-tool` merged into
  `internal-tool` (rank edge unused). Amends ADR 0032.
- Seam vocabulary sharpened per user refinement: **DI Seam** is the umbrella;
  **Gateway** is the stateful/heavyweight-service subset (Clock/TimerScheduler are
  seams, not Gateways). Suffix marks the category wherever the seam lives; placement
  follows contract ns-shape. **`CommandExecApi` wins**; `ExecGateway` retired
  everywhere including the Pi-host type.
- brmem made honestly Neutral Infra (user chose the ambitious option over retier):
  the whole `capability-kit/git` subpackage relocates to `foundation/git` keeping the
  `GitGateway` name — the explicit follow-up ADR 0032 anticipated, git only — and
  brmem's prompt root goes generic-XDG; the machine-recorded debt edge is deleted.
- command-backed-skill-registry folds into areg (user chose the fold over keep);
  the Host-surface `/pi` importer rule gets amended to record the sanctioned second
  importer; a new Objective Edge to `skill-management-subsystem` carries the
  coordination input.
- `hosts/ns-cli` → `hosts/ns`; Checkout-free distribution and Package preparation
  glossaried; both `ns` bins stay.
- **Command Face** canonized in the root glossary (used in six-plus files, previously
  defined nowhere).
- **Kernel rename parked** by user decision, revisit trigger =
  `extension-descriptor-contract` closure; recorded as a Parked roadmap row.

Landed in place this session under the documentation execution override: the
code-independent root `CONTEXT.md` edits (DI Seam/Gateway rewrite, Command Face,
checkout-free pair, Host-surface `repo-local-ns-extension` → `ns-extension` drift
fix), ADR 0033, and the spec asset. All code/topology changes exit as spec only.

## Objective Impact

- The second of four grilling rows is resolved; the Frontier now holds the remaining
  three cluster grills plus three graduated rows: foundation/kit junk-drawer reshape,
  brand-name batch (clinkr/areg; nscc stays with CCC), and the reshaping handoff
  vehicle — the last graduated from Fog because its stated trigger (first reshaping
  spec exists) fired.
- The meta-vocabulary risk hunch is confirmed but bounded: the row resolved in one
  session without splitting; the weight the record predicted mostly moved into the
  graduated foundation/kit row rather than requiring a mid-row split.
- Sweep-claim corrections recorded: `side-session` is a live, conformant Feature
  subpackage (suspect withdrawn); the registry had two consumers, not one; ADR 0032
  (accepted the same day as the sweeps) had already settled Neutral Infra admission,
  single-tier packages, and the tier canon — the session built on it instead of
  re-grilling it.
- Cross-initiative constraints held: no conflict with `cross-harness-parity`
  surfaced; `extension-descriptor-contract` shaped the kernel-name park rather than
  being contradicted.
- Method log (toward the future skill): verifying every sweep suspect against live
  source *before* asking dissolved two questions and re-scoped a third — sweeps age
  fast in an active repo; re-ground before grilling. One-question-at-a-time with a
  recommended answer worked; two mid-turn user interjections ("CommandExecApi wins")
  cleanly upgraded a flagged-for-rename into a decided retirement. Bundling
  decision-light ratifications (three stale-classification fixes; the husk cleanup)
  kept the session inside one sitting without hiding decisions. The user twice chose
  against the recommendation (kernel park over commit; registry fold over keep;
  brmem-neutral over retier) — recommendations calibrated the space rather than
  steered the outcome.

## Follow-Ups

- Execute the ten spec items (vehicle to be decided by the graduated
  reshaping-handoff-vehicle row; the spec is self-contained either way).
- Land PR #3332 (decision-free drift fixes) — still open, out of draft.
- The `skill-management-subsystem` Objective should consume the registry-fold input
  (edge recorded both sides) before reshaping registration machinery.
- Code-coupled doc edits (seven-tier glossary list, Host-surface areg amendment,
  directory-projection rule docs, git-seam glossary sentences) ride the executing PRs
  per the spec's ride-along notes.
