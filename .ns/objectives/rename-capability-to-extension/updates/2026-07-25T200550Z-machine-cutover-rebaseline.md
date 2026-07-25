# Machine Cutover Rebaseline

## Summary

The code-level rename and extension-package demotion that this record still described as planned have landed together in commit `4afa42169` and ADR 0044. The live package is `@nseng-ai/extension-kit`; canonical tiers are `extension` and `extension-kit`; all 11 ns extensions live directly under `ts/packages/incubator/`; tracked `ts/packages/capabilities/` and `ts/packages/capability-kit/` paths are absent; architecture projection and release metadata use the new identities.

The Objective is not complete because the semantic prose sweep remains materially open. Verified live ns-domain residue remains in conventions, Pi documentation, and skills, and the parent README-positioning reference still mixes the settled **the core**/**extensions** headings with old “capability” wording.

Provenance: objective-refresh basis target=5d52b257cc380143528f8353e3712e3cf63152fe from=trunk-HEAD

## Objective Impact

The roadmap marks the machine-readable cutover complete, replaces the obsolete code-plan/commit-boundary work with a final parent handoff, and narrows remaining execution to semantic prose classification and taxonomy reconciliation. The old blast-radius inventory remains immutable historical evidence; current work must use live paths.

## Follow-Ups

- Finish the live README/docs/skills semantic sweep without rewriting historical or generic ability language.
- Finish terminology reconciliation in the parent positioning reference.
- Record the final handoff and close when the scoped live residue is resolved.
