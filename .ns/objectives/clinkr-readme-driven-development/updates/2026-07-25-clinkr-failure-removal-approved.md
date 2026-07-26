# ClinkrFailure Removal Approved

## Summary

The user approved removing the public throwable `ClinkrFailure` API and Clinkr's special exception-to-`failure(...)` conversion. Expected operational failures remain explicit returned outcomes. Applications or Foundation adapters may deliberately catch known operational errors and return `failure(...)`; unexpected exceptions and programmer errors propagate unchanged to application crash policy.

## Objective Impact

This settles the last discussion-gated refactoring disposition. The contract discussion roadmap row is complete, and implementation may proceed through the approved clean-cut migration without preserving a throwable compatibility API or framework-level exception conversion.

The decision aligns exception behavior with the unified outcome contract: declared failures are values, while thrown errors retain attribution and stack information. Audit evidence found no material production `ClinkrFailure` construction sites; remaining construction was confined to Clinkr tests and a TypeScript style-guard fixture.

## Follow-Ups

- Remove `ClinkrFailure` exports, implementation, special catches, and focused conversion tests during reconciliation.
- Preserve or add explicit application/Foundation adapters where known operational exceptions need conversion to returned failure outcomes.
- Verify unexpected exceptions and outcome-schema violations still reach app crash policy unchanged.
- Begin the implementation roadmap in dependency order: Clinkr core, filesystem adapter/common path, Foundation, SDK and remaining callers, then obsolete-path deletion and README promotion.
