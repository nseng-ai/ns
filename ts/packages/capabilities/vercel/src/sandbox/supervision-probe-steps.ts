// Probe-3 (long-run supervision) step bodies: the testable Node-side
// functions behind the `workflows/supervision-probe.ts` steps. Each takes
// the gateway seam (defaulting to the real Vercel Sandbox adapter) and
// returns a plain serializable result — step results are durable,
// observable run state, so nothing here returns a live handle or a secret;
// only the sandbox name crosses step boundaries.
//
// At-least-once contract: `launchSupervisionProbe` backs the one step that
// must never run twice (its workflow step carries `maxRetries = 0`);
// `pollSupervisionProbe` (read-only) and `cleanupSupervisionProbe` (stop is
// a no-op on an already-stopped sandbox) are idempotent and safe to re-run.
import {
	buildSupervisionProbeCommand,
	planSupervisionProbe,
	parseSupervisionProgress,
	SUPERVISION_PROGRESS_PATH,
	type CreateSupervisionSandboxResult,
	type ReadSupervisionSandboxFileResult,
	type StopSupervisionSandboxResult,
	type SupervisionCleanupResult,
	type SupervisionLaunchResult,
	type SupervisionPollResult,
	type SupervisionProbeParams,
	type SupervisionSandboxGateway,
} from "./supervision-probe.ts";
import { createRealSupervisionSandboxGateway } from "./real-supervision-sandbox-gateway.ts";

/**
 * Create the minimal sandbox and launch the detached progress command. The
 * sandbox timeout comes from the plan (above the requested run length,
 * bounded well under the 5-hour cap) so an abandoned sandbox always
 * terminates itself.
 */
export async function launchSupervisionProbe(
	params: SupervisionProbeParams,
	sandboxes: SupervisionSandboxGateway = createRealSupervisionSandboxGateway(),
): Promise<SupervisionLaunchResult> {
	const plan = planSupervisionProbe(params);
	// `=== false` rather than `!`: the Vercel builder typechecks without
	// strictNullChecks, where truthiness checks do not narrow the union.
	if (plan.ok === false) {
		return { ok: false, code: "invalid-parameters", message: plan.message };
	}

	let createResult: CreateSupervisionSandboxResult;
	try {
		createResult = await sandboxes.createSandboxWithDetachedCommand({
			runtime: "node24",
			timeoutMs: plan.value.sandboxTimeoutMs,
			command: buildSupervisionProbeCommand(params.runSeconds),
		});
	} catch {
		return { ok: false, code: "launch-failed", message: "Sandbox launch failed." };
	}
	if (createResult.ok === false) {
		return { ok: false, code: "launch-failed", message: "Sandbox launch failed." };
	}
	if (!isSafeSandboxName(createResult.sandboxName)) {
		// Without a usable name the later steps cannot reattach to poll or
		// stop; the sandbox timeout is the cleanup backstop.
		return {
			ok: false,
			code: "launch-failed",
			message: "Sandbox name was unusable; the sandbox timeout is the cleanup backstop.",
		};
	}
	return { ok: true, sandboxName: createResult.sandboxName };
}

/** Read the detached run's progress file. Read-only and safe to re-run. */
export async function pollSupervisionProbe(
	options: { readonly sandboxName: string },
	sandboxes: SupervisionSandboxGateway = createRealSupervisionSandboxGateway(),
): Promise<SupervisionPollResult> {
	let readResult: ReadSupervisionSandboxFileResult;
	try {
		readResult = await sandboxes.readSandboxFile({
			sandboxName: options.sandboxName,
			path: SUPERVISION_PROGRESS_PATH,
		});
	} catch {
		return { ok: false, code: "poll-failed", message: "Supervision progress read failed." };
	}
	if (readResult.ok === false) {
		return { ok: false, code: "poll-failed", message: "Supervision progress read failed." };
	}
	const progress = parseSupervisionProgress(readResult.content);
	return { ok: true, phase: progress.phase, ticks: progress.ticks };
}

/**
 * Stop the sandbox. Idempotent: the gateway treats an already-stopped
 * sandbox as cleaned, so a step retry never fails on its own success.
 */
export async function cleanupSupervisionProbe(
	options: { readonly sandboxName: string },
	sandboxes: SupervisionSandboxGateway = createRealSupervisionSandboxGateway(),
): Promise<SupervisionCleanupResult> {
	let stopResult: StopSupervisionSandboxResult;
	try {
		stopResult = await sandboxes.stopSandbox({ sandboxName: options.sandboxName });
	} catch {
		return { ok: false, code: "sandbox-cleanup-failed", message: "Sandbox cleanup failed." };
	}
	if (stopResult.ok === false) {
		return { ok: false, code: "sandbox-cleanup-failed", message: "Sandbox cleanup failed." };
	}
	return { ok: true };
}

function isSafeSandboxName(name: string): boolean {
	return /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(name);
}
