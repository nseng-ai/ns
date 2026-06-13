# Package Cleanup Slice Complete

## Summary

Completed the `thermo-followups/package-cleanup` slice for `@asdl/branch-context`. The package now uses a required `BranchContextContext` for Branch Memory and Graphite gateways, removes package-internal real-gateway fallback construction, deletes the duplicate creation-params validation layer, trims the root barrel to the consumed public surface, and moves attach primitives into the attach module so creation depends on attach rather than the reverse.

The branch-context CLI scenario test was split from the former monolithic file into focused scenario files plus shared support. The dead scripted command harness was removed after mechanical confirmation that the active fake runner path did not need it. External consumers in CCC and pi-extensions were adjusted to use the curated branch-context surface and the exported context helper needed by the required-context refactor.

## Objective Impact

The second roadmap branch is complete. The required-context, single-validation-site, barrel-trim, layering, and test-health completion criteria for `@asdl/branch-context` are substantially satisfied for this slice. The public barrel includes `createBranchContextContext`/`BranchContextContext` in addition to the originally enumerated surface because the required-context refactor made that helper necessary for existing external runtime consumers without deep imports.

Validation evidence: `pnpm --dir ts run check && pnpm --dir ts run test` passed. Mechanical checks found no remaining `?? new Real*Gateway` fallbacks, deleted validation helpers, `RealCommandExecApi`, or `BranchContextPrimitiveContext` in `ts/packages/branch-context/src`. The largest branch-context test file is under 1k lines.

## Follow-Ups

Continue with `thermo-followups/canonical-contracts`: move the impl-command formatter and command-name literal into `@asdl/branch-context`, type output-message producers against the canonical contract, and clean up the remaining CCC residue.
