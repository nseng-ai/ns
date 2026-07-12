# Rebaseline: lifecycle-row delivery cross-objective and the settled `ns update` surface

## Summary

Trunk-explicit, non-closing rebaseline against ground truth at HEAD. Since the 2026-07-09
refresh (basis `a814ebe36`), the extension lifecycle work under the downstream
`ship-objectives-to-customers` Objective landed the substance of this umbrella's last open
follow-on row and moved the `ns update` surface. Verified at HEAD:

- **The uninstall / stale-after-upgrade / rename-cleanup follow-on row is delivered,
  cross-objective.** The manifest-authority removal machinery landed in this umbrella's
  shared package: `ts/packages/capabilities/harness-artifacts/src/provision-removal.ts`
  models removal reasons `removed-source` / `deselected-harness` / `obsolete-file` /
  `same-target-replacement`, applied through the descriptor-activation transitions
  (`project-harness-artifact-transitions.ts`). The command surface shipped as the
  descriptor-activation lifecycle owned by `ship-objectives-to-customers`: `ns init` full
  reconciliation plus `ns extension install|uninstall|update` (identity-matched uninstall,
  pi-`remove`-shaped; update runs activation reconciliation). Evidence:
  `ship-objectives-to-customers/updates/20260710T115753Z-ns-init-activation-review-remediation.md`,
  `.../20260712T002419Z-extension-uninstall-lifecycle-reconciliation.md`,
  `.../20260712T132242Z-extension-update-acquisition-states.md`. Roadmap row flipped `[x]`.
- **Top-level `ns update` narrowed to a reserved self-update-only stub.** The old
  `--extensions` reconcile mode is gone from the command
  (`harness-artifacts/src/ns/commands/update.ts`: "Reserved ns self-update surface. Use
  ns extension update <source> ..."; handler returns `self-update-not-implemented`). This
  resolves the long-standing open question about where the `ns update` surface lives, and
  the drift-nudge parked row's mechanism wording was rebaselined accordingly (the parked
  decision itself stands).
- **The thermo remediation stack merged.** The roadmap note "the local stack awaits
  separate human authorization to submit" was stale: PRs #3158–#3163 (`harness-thermo/*`)
  are recorded merged in the post-review-cleanup child's
  `updates/20260707T230504Z-live-review-feedback-rebaseline.md`, and the deliverables
  (e.g. `provisionFirstPartySkill()`) are live on trunk in `@nseng-ai/harness-artifacts`.
- **Precision fix:** "leaving only `check.ts` in areg's operations" overstated — areg's
  `operations/` directory holds 17 inspector files (doctor-skills, skill-kind, skill-find,
  project-inspection, ...); `check.ts` is the only *lockfile-adjacent* operation. Risk
  bullet reworded.
- **Edge annotations refreshed** (this record's side only): the acquisition child's
  `ns.toml` key is `extensions = [...]` (the `artifact-packages` working name was
  superseded by the child's 2026-07-07 storage decision), and ADR 0033's
  command-backed-skill-registry fold into areg has landed
  (`ts/packages/tools/areg/src/command-backed-skill-registry.ts`).
- **Package-boundary risk further de-risked:** the descriptor-activation lifecycle became
  the proving multi-consumer of `@nseng-ai/harness-artifacts` with additive API growth
  and thin consumers.

Other contract facts re-verified unchanged: all eight frontmatter edges resolve to real
records; five child Subobjectives carry `closed.md`; `remote-artifact-module-acquisition`
remains open with the end-to-end remote evidence and ns self-update rows outstanding (its
`[~]` row note rebaselined from "design-heavy front" to landed-slice status); no
`npx skills` reference in areg src; `skill-kind.ts` says harness overlays; root
`CONTEXT.md` carries the Harness artifact vocabulary cluster; the Pup report remains at
`references/pup-skill-management-report.md`.

Provenance: objective-refresh basis target=c1cb8d5d3 from=trunk-HEAD

## Objective Impact

- `roadmap.md`: follow-on lifecycle row `[x]` with cross-objective delivery evidence; thermo
  row's stale submit-pending sentence replaced with merged-stack evidence; the
  remote-acquisition `[~]` row and drift-nudge parked row rebaselined to the current
  surfaces. `## Work` now has no `[ ]` rows — only the in-flight `[~]` acquisition child.
- `objective.md`: the `ns update` open question marked resolved by landed state; the
  Non-Goals lifecycle and drift-nudge bullets updated; package-boundary risk bullet
  records the multi-consumer de-risking; areg-operations precision fix; two edge
  annotations refreshed.
- No closure: completion criteria require all Subobjectives closed or parked and
  synthesized, and `remote-artifact-module-acquisition` is still in flight.

## Follow-Ups

- Synthesize `remote-artifact-module-acquisition` closure evidence here when it closes
  (fire-and-forget defense); its remaining rows are the end-to-end remote-module evidence
  and the ns self-update mechanism behind the reserved `ns update` stub.
