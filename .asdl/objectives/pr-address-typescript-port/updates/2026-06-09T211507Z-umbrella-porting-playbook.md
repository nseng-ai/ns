# Umbrella Porting Playbook Recorded; Endgame Stack Complete

## Summary

The final endgame branch landed as `pr-address-ts/playbook`. Reusable migration guidance from the `pr-address` port now lives at `docs/typescript-porting-playbook.md` (indexed in `docs/README.md`), written for later capability ports (`brmem`, `handoff`, `objective`, `roaster`, `slot`): vertical-slice/keystone-first porting shape, fallback-dispatch-as-removable-scaffolding, parity-fixture discipline (capture while the reference exists, byte-for-byte vs structured-semantic bars, Pydantic explicit-`null` and `ensure_ascii` traps), capability-shaped gateway/fake seams, checked-in deterministic bundle distribution with a freshness CI guard, retirement sequencing (plugin retirement guard, gated deletion, zero-importer rule), and portability limits. The earlier retirement-playbook material in the deleted `packages/asdl-pr-address/docs/development.md` is superseded by this cross-package doc. Verification: `just dprint-check` passed.

With this branch the nine-branch Endgame Stack is fully landed; every roadmap row is complete.

## Objective Impact

- The "Feed lessons into the umbrella porting playbook" roadmap row is complete; no active non-parked roadmap work remains.
- The remaining open question — which command-runtime pieces deserve extraction — is deliberately deferred to a second capability port and recorded as such in the playbook; it is follow-on umbrella-migration work, not remaining work for this Objective.
- Completion criteria are evidenced across the stack: TypeScript is the default invocation path in local-checkout and installed-skill contexts, contracts are preserved or intentionally changed with recorded rationale, the plugin is retired, Python is fully deleted with PyPI `0.1.1` as external rollback, docs point to TypeScript paths, and lessons are recorded for later ports. Closure is ready for evaluation.

## Follow-Ups

- Evaluate Objective closure (left to the user per the stack execution plan).
- PR submission of the nine-branch stack remains manual.
- Future: tighten the classification trio's schema documents to the structural parity bar; revisit command-runtime extraction during the second capability port.
