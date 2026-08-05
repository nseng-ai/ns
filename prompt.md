## Completion instructions
After you finish the implementation:
1. Create or update the branch commit using the repo's normal workflow.
2. Then run `!ns flow submit`.

fix

 Feedback summary

 All 33 threads are valid and current, but they reduce to two mechanical issues:

 1. Thread 1: ts/packages/public/ns/src/sdk/sdk.ts replaced a curated SDK surface with export *. The checkout-free @nseng-ai/ns/sdk entry should explicitly
    mirror the canonical exports from ts/packages/public/sdk/src/sdk/index.ts.
 2. Threads 2–33: broad @ts-nocheck directives were added to compatibility files retained during the filesystem-backed command cutover. Repository inspection
    indicates these files are now obsolete:
     - Their replacements live in the new filesystem command trees.
     - Current extension descriptors/catalogs load those new sources.
     - The old command wrappers and preinstalled registration catalog are unreferenced.
     - The two .legacy.ts test suites are excluded from Vitest discovery and superseded by current source-inventory/scenario coverage.

 The likely fix is deletion of obsolete compatibility code rather than adding casts or narrowly scoped suppressions.

 Proposed disposition

 ### Primary batch — 33 items

 One behavior-preserving follow-up commit on recover-sdk-filesystem-host-cutover: restore the curated SDK fold and remove obsolete compatibility residue.

 #### Batch A: Curate the checkout-free SDK export surface — 1 thread

 - Thread 1
 - Replace export * from "@nseng-ai/sdk" in:
     - ts/packages/public/ns/src/sdk/sdk.ts
 - Use explicit value and type re-exports matching the canonical curated surface in:
     - ts/packages/public/sdk/src/sdk/index.ts
 - Reactivate or replace the export-parity test currently parked as:
     - ts/packages/public/ns/test/sdk-export-surfaces.legacy.ts

 This does not intentionally change the public API; it makes the existing surface deliberate and greppable.

 #### Batch B: Delete superseded command compatibility modules — 29 threads

 - Thread 2: obsolete Herdr command wrapper.
 - Threads 3–15: obsolete Objectives wrapper and legacy command modules.
 - Threads 16–30: obsolete PR Feedback name-based adapter and legacy command modules.

 The active implementations already live under the filesystem command-source trees, for example:

 - Herdr: src/ns/cli/herdr/**
 - Objectives: src/cli/objective/**
 - PR Feedback: src/ns/cli/address/**

 The current descriptors point at these trees, and current tests check route/operation parity. Deleting the old files removes the suppressions without
 introducing compatibility casts.

 #### Batch C: Delete superseded ns catalog and dormant legacy tests — 3 threads

 - Thread 31: delete the obsolete descriptor-registration catalog:
     - ts/packages/public/ns/src/init/ns/preinstalled-command-catalog.ts
     - The active replacement is ts/packages/public/ns/src/cli/preinstalled-command-catalog.ts.
 - Threads 32–33: delete the excluded .legacy.ts CLI suites:
     - ts/packages/public/ns/test/harness-artifacts-ns-cli-contracts.legacy.ts
     - ts/packages/public/ns/test/init-ns-cli-contracts.legacy.ts