# ADR 0057: Retry-safe User extension lifecycle mutations

## Status

Accepted

## Context

ADR 0056 established package identity as the authority for targeted bundled Harness artifact removal and selected declaration-first User uninstall. It also allowed User npm update acquisition to change canonical managed package bytes before descriptor, admission, and artifact preflight completed. Those orderings can remove the authority needed for a safe uninstall retry or lose the previous package after an invalid update candidate.

## Decision

For an identifiable User uninstall, prepare and validate targeted removals, apply bundled Harness artifact removals, then perform the guarded declaration write. Lifecycle-owned npm cleanup remains last. Package identity remains deletion authority. If a missing local source prevents package identity from being established, remove only the dead declaration and retain artifacts.

User npm update prepares a package-specific candidate below lifecycle-owned managed storage. Descriptor loading, whole-catalog admission, and bundled artifact preflight use candidate bytes before canonical promotion. Promotion uses package-specific same-filesystem replacement and retains either the previous canonical project or the fact that no project existed. Artifact apply follows promotion. Successful apply commits by deleting retained operation state; failed apply rolls canonical package state back.

Bundled Harness artifact application remains non-atomic across Harness roots. Completed transitions remain explicit and are reconciled idempotently on retry; package rollback does not claim artifact rollback.

This ADR supersedes only ADR 0056's identifiable-uninstall declaration-first ordering. Its package-name authority, missing-identity exception, targeted reconciliation, and non-atomic retry model remain.

## Rejected alternatives

- A generic filesystem transaction framework: this lifecycle needs a narrow package-specific prepared operation.
- Manifest-derived deletion authority: manifests are reconciliation evidence, not authority to delete a package's artifacts.
- Hidden durable ownership or transaction state: operation identity and retained paths remain within validated lifecycle-owned package storage.
- Cross-Harness atomicity claims: independent roots can still complete partially.

## Consequences

Invalid or blocked npm candidates no longer replace canonical User package bytes. An artifact apply failure restores previous canonical bytes where rollback succeeds and reports both completed artifact transitions and retained package state where it does not. Identifiable uninstall retains declaration authority until artifact removal succeeds; a later compare-and-write race leaves already-removed artifacts safe to reconcile again.
