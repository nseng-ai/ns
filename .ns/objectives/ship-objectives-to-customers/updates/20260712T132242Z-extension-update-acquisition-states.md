# Extension update acquisition states implemented

## Summary

`ns extension update` now models acquisition with distinct preview and reconcile result unions: preview can produce only usable-preview or apply-required-preview success, while reconcile can produce only applied success. Each success carries its coupled source kind and acquisition intent; npm applied variants also couple pinned intent to unchanged/restored and floating intent to refreshed/restored. The public outcome classifier therefore consumes acquisition alone instead of accepting an independently derived source that could disagree.

Dry-run treats the expected missing-package preview diagnostic as a successful plan with unavailable exact effects, while real package-inspection errors remain failures. Applied updates report semantic refreshed, restored, unchanged, or local-in-place facts and then run descriptor activation preflight/apply.

Acquisition remains live and non-transactional for Pi parity: there is no staging, backup, rollback, or generation switch. In particular, activation preflight failure after a successful floating refresh may leave refreshed managed bytes installed. `sol-1` is **not implemented**; this risk is explicitly accepted for this slice.

## Objective Impact

- The activation lifecycle roadmap row advances to complete because install, uninstall, and update now all perform activation reconciliation.
- The broader extension-verbs row remains partial: `list` and migration of the old top-level update mode remain.
- No customer launch or onboarding completion criterion advances.

## Evidence

Focused ns-init and kernel tsgo checks/tests pass, including update gateway translation and fake-driven public-operation scenarios for local, pinned, floating, missing, failure, and activation paths.

## Follow-Ups

- Complete the remaining `ns extension list` and retired top-level update-reference work through the dedicated customer-surface Subobjective.
- Carry the accepted non-transactional acquisition caveat into downstream release verification where relevant.
