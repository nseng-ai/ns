# Parked-breadth disposition session: all eight rows disposed

## Summary

Interactive disposition session (user-decided, row by row) covering every remaining parked row from the 2026-07-06 steelthread reshape. Every row now has an explicit disposition, completing the umbrella's last open Work row's decision content.

Dispositions:

1. **Reconciliation/vocabulary sweep** (`skillx`, `@nseng-ai/areg`, `npx skills`, repo skill conventions, harness skill-invocation docs; bare-"artifact" collision cleanup incl. renaming AREG's "managed artifacts" overlay sense) — **graduates into its own Subobjective**. Broad, decision-bearing, spans docs/CONTEXT vocabulary/AREG code; child record creation pending.
2. **Marketplace or remote catalog discovery** — **retired**. Contradicts the record's hard non-goals, has no user while ns is private, and adjacent acquisition ambitions were already retired 2026-07-06. If ns's audience widens, a fresh Objective with real requirements beats a stale parked row.
3. **Remote acquisition sources for artifact-bearing modules** (npm/git/local-path specs, anticipated `ns.toml` `artifact-packages`) — **graduates into its own Subobjective** (user decision, against the keep-parked recommendation). Starting design point stays pi's debugged spec grammar and pinning semantics per `npm-bundled-artifact-provisioning/updates/20260706T215708Z-pi-update-mechanism-comparison.md`. Child record creation pending.
4. **Update/uninstall/version-resolution surface, stale-after-upgrade detection, rename cleanup** — **split**: uninstall/stale-detection/rename-cleanup becomes a follow-on row on the landed minimal `ns update` (manifest-enabled, small slices on existing plumbing); version-resolution-for-fetched-modules is assigned to the new remote-acquisition Subobjective where it becomes real.
5. **Drift detection / staleness nudge** — **stays parked** (user decision). The precondition (`ns update` landed) is satisfied and the planner already computes the diff, but surfacing it is deferred until staleness pain is actually felt; invoked-only reconcile remains the accepted gap.
6. **Project trust gating for provisioned artifacts** — **retired** (user decision). ns commits to trusted-repo assumptions as the operating contract while private/unreleased. Recorded honestly: retiring this while graduating remote acquisition (row 3) means fetched artifact-bearing modules will provision prompt-payload files with no consent gate; this is a deliberate risk acceptance, and pi's trust-store design remains the recorded blueprint if the audience ever widens — reopen as a fresh Objective then.
7. **Per-resource filtering / enable-disable** — **retired** (user decision). All-or-nothing provisioning is the contract; the reconcile architecture's desired-state-filter accommodation (child decision `20260706T194500Z` §3) remains in the design record if a future Objective revisits it.
8. **`agent` and `extension-bundle` kind provisioning** — **stays parked** with an explicit trigger: the first real ns-owned agent definition or provisionable extension bundle. The day-one discriminated-union types mean deferral precludes nothing.

## Objective Impact

- The open Work row "Decide the disposition of each parked-breadth row" is satisfied and marked `[x]`; a successor row tracks creating the two graduated Subobjective records (reconciliation sweep, remote acquisition) with edges.
- `## Parked` now contains only two live rows (drift nudge; agent/extension-bundle kinds), both with explicit triggers; three rows are `[retired]` with rationale; two are graduated pending child creation; one is re-split between a follow-on row and the acquisition child.
- Net effect on umbrella closure: after the two Subobjective records exist and close (plus the small uninstall/rename follow-on row, if kept umbrella-owned), every completion criterion is satisfiable; parked-with-trigger rows do not block closure since they carry explicit dispositions.

## Follow-Ups

- Create the `harness-artifact-vocabulary-reconciliation`-shaped and `remote-artifact-module-acquisition`-shaped Subobjective records, add mirrored edges, and add `[~]` rows here.
- Keep the trust-gating risk acceptance visible in the remote-acquisition child's Assumptions and Risks so it is re-judged with real fetch semantics on the table.
