# Extension Vocabulary Verdict

## Summary

The user settled the rename contract:

- **ns extension** replaces **capability** as the canonical term and covers both the technical package and the feature area it implements; the prior construct-versus-feature distinction is intentionally removed.
- Bare **extension** is permitted when context makes the referent unambiguous. Where ns and Pi could both be meant, qualify the term as **ns extension** or **Pi extension**.
- The root README taxonomy presents objectives, handoffs, flow, and pr-feedback as **the core**, and presents slots, reviews, plans, and branch-context simply as **extensions**.
- `capability-kit` becomes `extension-kit`. Its documentation must describe it as the shared library for extensions defined in the ns repository; this verdict does not claim it is a general third-party extension framework.

## Objective Impact

The first roadmap decision is complete. The vocabulary/docs sweep can now replace the old Capability, Capability API, Capability Kit, capability tier, and related forms with extension-based terms while preserving explicit Pi/ns qualification where ambiguity exists. The blast-radius inventory must determine the exact code identifiers, package metadata, and paths affected before code moves are sequenced with the parent umbrella's demotion commit.

The ambiguity-leakage risk remains active but now has an accepted mitigation. The README taxonomy question and target kit name are no longer open; only the sequencing of the `extension-kit` code/path rename remains to be planned.

## Follow-Ups

- Inventory and classify every live use of capability vocabulary as vocabulary-sweep, code-plan, or deliberately kept.
- During the vocabulary layer, define the extension-based replacement for **Capability API** and related dependency-graph language without reintroducing a second noun for feature areas.
- Reconcile the parent umbrella's root README positioning reference to **the core** and **extensions**.
- Decide whether the `extension-kit` code/path rename lands inside the demotion commit or in an adjacent slice.
