# Trunk rebaseline: both reshape stacks landed, constraints discharged

Provenance: objective-refresh basis target=c1cb8d5d3 from=trunk-HEAD

## Summary

A verified trunk rebaseline (2026-07-12) found the record's status claims superseded
by landed ground truth:

- **Both executed reshape stacks are merged to trunk.** The cmux reshape (six
  slices: 83c489d72, 9d2e87f53, a26e46966, 188594fbe, e2f95f37d, 61307d581) and the
  layering reshape (9865275cf, 07dc1d0be, bcbd592a6, 16ea42059, 7d51e6877,
  ae5de5712, f93bec99a) are in `master` history. `capabilities/cmux` and `hosts/ns`
  are tracked; `capabilities/ccc`, `hosts/ns-cli`, `hosts/nscc`,
  `hosts/pi-command-surfaces`, and `hosts/command-backed-skill-registry` are not.
  The "local-only pending review / no submit occurred" status in earlier updates is
  historical.
- **Workspace baseline moved 29 → 26 tracked packages** (probe:
  `git ls-files 'ts/packages/**/package.json'` = 26) and 13 → 15 context files
  (root + 14; foundation, ns-pi-subagents, and cmux contexts are new). The
  rewritten `CONTEXT-MAP.md` Inventory Baseline now states 26 and matches — the
  original 26-vs-29 drift finding is resolved by the reshapes themselves.
- **Cross-initiative constraints discharged:** `cross-harness-parity` and
  `extension-descriptor-contract` both carry `closed.md` at trunk. The latter fires
  the parked kernel-name row's revisit trigger; off-trunk branches
  `kernel-sdk-rename/*` already carry a `@nseng-ai/kernel` → `@nseng-ai/sdk` rename
  whose tip commit says it resolves that row when it lands (still `@nseng-ai/kernel`
  at trunk HEAD).
- **Open-row premises re-verified:** foundation/junk-drawer premises all hold
  (one-module `config`, `terminal/runner-usage`, `primitives/skill-lookup`,
  Machine Envelope split clinkr-construct / foundation-parse, ~20 kit subpaths);
  brands row holds (no areg context; root glossary still defers to areg
  vocabulary); review-residue row narrowed — no live Roaster reference remains
  (historical ADRs 0007/0027 only) while `group: "address"` persists in
  `pr-feedback/src/ns-extension.ts`; lifecycle row input — the
  `flow-land-execution-migration` Objective closed at basis with land execution
  Flow-owned behind `@nseng-ai/flow/api`. ADR inventory for the doc-structure Fog is
  now 41 files with six duplicated numbers (was 36/five).

## Objective Impact

`objective.md` assumptions/risks and Fog numbers rebaselined to the 26-package
trunk reality; the two execution task rows carry landed-on-trunk completion
evidence; the four open grilling rows' notes record verified premise movement; the
parked kernel-name row records its fired revisit trigger. The Frontier is
unchanged: five open HITL grilling rows (foundation/junk drawer, brands, lifecycle
spread, review residue, triage) plus the parked kernel-name row.

## Follow-Ups

- The kernel-name row resolves when the off-trunk `kernel-sdk-rename/*` work lands;
  reconcile this record's Parked section with that branch's own row edit at merge
  time.
- Re-enumerate lifecycle-ownership facts at grilling time per the reshaping handoff
  vehicle's volatile-fact duty.
