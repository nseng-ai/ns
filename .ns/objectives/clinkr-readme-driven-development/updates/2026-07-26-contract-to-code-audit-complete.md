# Contract-to-Code Audit Complete

## Summary

The Clinkr package exports, implementation, focused tests, and representative current ns callers were audited against the provisional README contract. `references/contract-audit.md` records evidence, migration impact, accidental complexity, and a proposed disposition for all ten confirmed reconciliation mismatches plus six additional material findings.

The audit settled its evidence bar: up-to-date ns usage is sufficient evidence for behavior it exercises, focused tests establish precise semantics, and operational claims not exercised by ns require direct verification. Evidence does not automatically elevate accidental current behavior into the desired contract.

## Objective Impact

The audit roadmap row is complete. Representative callers are current against the implemented Clinkr API, but several necessarily depend on surfaces superseded by the provisional contract because their replacements do not exist yet. The next step is user discussion of the proposed refactors and disputed dispositions before any TypeScript reconciliation.

Two concrete API choices need steering: retain established positional metadata spelling `position` or adopt draft spelling `index`; and document the comprehensively tested `md` format alias or deliberately remove it. The audit also identified the SDK adapter, Foundation `defineCli`, outcome schema/rendering model, and raw caller classification as major reconciliation seams.

## Follow-Ups

- Discuss and approve, revise, or park each contract-supporting refactor before implementation.
- Resolve `position` versus `index` and the public status of `md`.
- Sequence reconciliation through Clinkr core, Foundation, and SDK without turning mounted feature groups into executables.
- Directly verify shell completion operational instructions before README promotion.
