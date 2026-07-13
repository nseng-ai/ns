// Probe-2 (sandbox-in-workflow): the verified private-repository Sandbox
// hello probe lifted into a workflow, with the clone token minted in-process
// through the mint core (no HTTP hop to /api/mint). The mint, Sandbox
// creation, marker/HEAD verification, and cleanup all run inside one
// explicit step: step arguments and results are durable, observable run
// state, so the clone token must never cross a step boundary — minting in
// its own step would journal the token. The Sandbox SDK calls therefore run
// as ordinary in-step calls here rather than as the SDK's
// workflow-integrated implicit steps; probe-3 (long-run supervision) owns
// that cookbook shape. The probe is short-lived by design (bounded by the
// probe's fixed sandbox timeout), well under a single step's function
// ceiling. Live workflow execution is pending verification: nothing here
// has run on Vercel yet.
import {
	runWorkflowSandboxProbe,
	type WorkflowSandboxProbeResult,
} from "../src/sandbox/workflow-probe.ts";

/**
 * The manifest identity `start()` must reference for
 * {@link sandboxProbeWorkflow}.
 *
 * The trigger route's function bundle is emitted by Vercel's Node builder
 * without the Workflow SDK transform, so a directly imported workflow
 * function carries no transform-injected `workflowId`; callers pass this
 * metadata id explicitly instead. The id is derived from this file's path and
 * export name (`workflow//./workflows/<file>//<export>`), and the
 * `build:deployable` gate fails when the emitted workflow manifest does not
 * contain it.
 */
export const sandboxProbeWorkflowId = "workflow//./workflows/sandbox-probe//sandboxProbeWorkflow";

export async function sandboxProbeWorkflow(revision: string): Promise<WorkflowSandboxProbeResult> {
	"use workflow";
	const result = await runSandboxProbeStep(revision);
	return result;
}

async function runSandboxProbeStep(revision: string): Promise<WorkflowSandboxProbeResult> {
	"use step";
	return await runWorkflowSandboxProbe({ revision, environment: process.env });
}
