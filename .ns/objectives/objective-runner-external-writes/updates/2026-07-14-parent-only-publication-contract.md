# Parent-only publication contract settled

## Summary

ADR 0037 now refines ADRs 0022 and 0024 with a conditional post-checkpoint publication path. The implementation child and every Objective Runner step remain absolutely prohibited from external writes. A distinct trusted parent may publish only after `runner-finish` verification and commit, parent checkpoint judgment, and any material Objective tracking, with both durable Runner Policy permission and an exact human-confirmed launch attestation.

The contract binds one invocation to one Objective slug, non-trunk branch, already-existing PR, launch HEAD, and remote PR head. Authorization remains parent-held outside the repository rather than durable machine state. Push is guarded and precedes a best-effort managed PR-region update; push success plus PR-edit failure is an explicit successful partial outcome with advanced chained facts and no rollback.

## Objective Impact

The first roadmap row is complete. ADR, objective-system documentation, runner/autorun skills, run-digest guidance, the canonical child prohibition, and prompt/Pi consumers now agree on trust zones and ordering. No working bind, publish, Flow mutation, or external-write path exists yet.

Validation on the implementing branch passed focused Objective tests, formatting, lint, native TypeScript checks, the TypeScript style guard, and full `just`.

## Follow-Ups

Add the Objective-owned versioned authorization and cumulative-summary facts with fake-driven refusal tests before exposing Flow publication mechanics. Keep all implementation local-only until the separately authorized final probe.
