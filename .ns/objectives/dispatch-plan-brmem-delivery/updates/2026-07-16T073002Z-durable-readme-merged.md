# Settled contract merged into the durable Vercel capability README

## Summary

The settled Saved Plan dispatch contract now lives in the durable user-facing home, `ts/packages/capabilities/vercel/README.md`, as the "Dispatch a Saved Plan" section. No file existed at that path before this slice; the new README frames the package and explicitly defers the broader cloud-dispatch contract (prompt dispatch, setup, credentials, anchor-PR lifecycle, scheduled work) to `cloud-execution`'s canonical draft at `.ns/objectives/cloud-execution/references/README-draft.md`, so the concurrent broader README work is coordinated with rather than absorbed or overwritten.

The merged section replaces the draft's "not yet implemented" framing with an accurate status contract: the kernel command, Pi and portable wrappers, Branch Memory delivery, locator-only workflow input, sandbox precheck, and Dispatch ID recovery lookup are locally implemented under fake-driven tests; the live end-to-end proof is unwitnessed; and the deployable rebuild (`build:deployable`) is blocked in this worktree by absent local Vercel Project Settings, so no deployment carries the plan path yet.

This Objective's canonical reference is repointed: `references/README-draft.md` is now a pointer stub to the durable README, and `objective.md` names the durable README as canonical. No `cloud-execution` tracking or reference file was mutated, no live claim was added, and no external action was taken.

## Objective Impact

The final documentation row is now in progress with only cross-objective completion evidence remaining: the durable merge and canonical repoint are done, and providing focused completion evidence back to `cloud-execution` waits on the human-run live proof and that Objective's own update workflow. All locally executable autorun rows are otherwise complete; the remaining rows are the live end-to-end proof interlude and the blocked `build:deployable` evidence on the workflow row.

## Follow-Ups

- Run the separately authorized live Saved Plan dispatch and fold only witnessed facts into the durable README's status prose.
- Obtain `build:deployable` evidence from a linked or repository-supported checkout, then ship a deployment carrying the plan path.
- After live proof, provide focused completion evidence back to `cloud-execution` through its own update workflow and close out the documentation row.
