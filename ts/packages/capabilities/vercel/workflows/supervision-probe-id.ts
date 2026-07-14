import { workflowManifestId } from "./workflow-manifest-id.ts";

// The supervision-probe workflow's manifest metadata id, split from
// `supervision-probe.ts` on purpose: unlike the earlier probes, that
// workflow module imports the Workflow SDK runtime (`sleep` from
// "workflow"), whose root types the Vercel Node builder cannot resolve
// (`export * from '@workflow/core'` resolves under the workspace tsc but
// not under the builder's TypeScript). Route bundles import this
// runtime-free module instead, keeping `vercel build` free of TypeScript
// diagnostics — the `build:deployable` gate fails on any.

/**
 * The manifest identity `start()` must reference for the
 * `supervisionProbeWorkflow` export of `workflows/supervision-probe.ts`.
 *
 * The trigger route's function bundle is emitted by Vercel's Node builder
 * without the Workflow SDK transform, so a directly imported workflow
 * function carries no transform-injected `workflowId`; callers pass this
 * metadata id explicitly instead. The id is derived from the workflow
 * file's path and export name (`workflow//./workflows/<file>//<export>`),
 * and the `build:deployable` gate fails when the emitted workflow manifest
 * does not contain it.
 */
export const supervisionProbeWorkflowId = workflowManifestId(
	"workflows/supervision-probe.ts",
	"supervisionProbeWorkflow",
);
