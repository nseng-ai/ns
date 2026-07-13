// Dispatch workflow step bodies: the testable Node-side functions behind
// the `workflows/dispatch.ts` steps. Each takes the gateway seams
// (defaulting to the real adapters) and returns a plain serializable
// result — step results are durable, observable run state, so nothing here
// returns a live handle or a secret; only the sandbox name and non-secret
// facts cross step boundaries.
//
// At-least-once contract: `launchDispatchRun` backs the one step that must
// never run twice (its workflow step carries `maxRetries = 0`);
// `pollDispatchRun` and `readDispatchOutcome` are read-only,
// `landDispatchRun` force-pushes the same `HEAD` to the same ref,
// `cleanupDispatchRun` treats an already-stopped sandbox as cleaned, and
// the report steps replace a marked section / skip an already-posted
// marked comment — all idempotent and safe to re-run.
//
// Credential discipline (credentials design, seam-design §9): the clone
// token is minted in-process here at sandbox creation and injected only
// into the git source; the landing token is late-minted only at landing
// time and injected into the single landing command's environment; harness
// model keys are copied by name into the detached launch command's
// environment. None of them is journaled, logged, returned, or placed in
// the sandbox-wide environment.
import type { DispatchTokenMinter } from "../mint/mint-core.ts";
import { createGitHubAppDispatchTokenMinter } from "../mint/real-gateways.ts";
import {
	parseMintRuntimeConfig,
	type MintEnvironment,
	type MintRuntimeConfig,
} from "../mint/runtime-config.ts";
import type {
	SupervisionCleanupResult,
	SupervisionPollResult,
} from "../sandbox/supervision-probe.ts";
import type { DispatchReportGateway } from "./anchor-pr-report.ts";
import {
	buildDispatchLandingCommand,
	DISPATCH_DECISION_LOG_PATH,
	DISPATCH_LANDING_TOKEN_ENV_NAME,
	DISPATCH_PROMPT_PATH,
	DISPATCH_RESULT_PATH,
	DISPATCH_SETTINGS_PATH,
	isValidDispatchAnchorBranch,
	parseDispatchHarnessResult,
	planDispatchSupervision,
	validateDispatchRunInput,
	type CreateDispatchSandboxResult,
	type DispatchLandingResult,
	type DispatchLaunchResult,
	type DispatchOutcomeReadResult,
	type DispatchReportResult,
	type DispatchRunFailureCode,
	type DispatchRunInput,
	type DispatchSandboxGateway,
	type ReadDispatchSandboxFileResult,
	type StopDispatchSandboxResult,
} from "./dispatch-run.ts";
import {
	resolveConfiguredHarnessInvocation,
	type HarnessInvocation,
	type HarnessInvocationResolver,
} from "./harness-invocation.ts";
import { createGitHubDispatchReportGateway } from "./real-dispatch-report-gateway.ts";
import { createRealDispatchSandboxGateway } from "./real-dispatch-sandbox-gateway.ts";

export interface DispatchStepDeps {
	readonly environment: MintEnvironment;
	readonly createDispatchTokenMinter: (config: MintRuntimeConfig) => DispatchTokenMinter;
	readonly createSandboxGateway: () => DispatchSandboxGateway;
	readonly createReportGateway: (options: {
		readonly config: MintRuntimeConfig;
		readonly minter: DispatchTokenMinter;
	}) => DispatchReportGateway;
	readonly resolveHarnessInvocation: HarnessInvocationResolver;
}

export function defaultDispatchStepDeps(): DispatchStepDeps {
	return {
		environment: process.env,
		createDispatchTokenMinter: (config) => createGitHubAppDispatchTokenMinter(config),
		createSandboxGateway: () => createRealDispatchSandboxGateway(),
		createReportGateway: ({ config, minter }) =>
			createGitHubDispatchReportGateway({ repository: config.githubRepository, minter }),
		resolveHarnessInvocation: resolveConfiguredHarnessInvocation,
	};
}

/**
 * Create the dispatch sandbox over the exact dispatched SHA and launch the
 * configured harness detached inside it. Everything that can be checked
 * before the billable sandbox exists is checked first (LBYL: input, runtime
 * configuration). Harness configuration lives in the checkout's own root
 * `ns.toml` at the dispatched SHA, so the harness invocation and its launch
 * environment can only be resolved once the sandbox exists; those checks —
 * and every other post-creation failure — stop the sandbox before
 * returning, with the sandbox timeout as the backstop.
 */
export async function launchDispatchRun(
	input: DispatchRunInput,
	deps: DispatchStepDeps = defaultDispatchStepDeps(),
): Promise<DispatchLaunchResult> {
	const validated = validateDispatchRunInput(input);
	// `=== false` rather than `!`: the Vercel builder typechecks without
	// strictNullChecks, where truthiness checks do not narrow the union.
	if (validated.ok === false) {
		return { ok: false, code: "invalid-input", message: validated.message };
	}
	const run = validated.value;

	const configResult = parseMintRuntimeConfig(deps.environment);
	if (configResult.ok === false) {
		return {
			ok: false,
			code: "dispatch-misconfigured",
			// Variable name only — never an environment value.
			message: `Dispatch configuration is invalid: ${configResult.error.variable}.`,
		};
	}
	const config = configResult.value;

	const minter = deps.createDispatchTokenMinter(config);
	const mintResult = await minter.mintDispatchToken({
		repository: config.githubRepository,
		purpose: "clone",
	});
	if (mintResult.ok === false) {
		return { ok: false, code: "launch-failed", message: "Clone token mint failed." };
	}

	const sandboxes = deps.createSandboxGateway();
	let createResult: CreateDispatchSandboxResult;
	try {
		createResult = await sandboxes.createDispatchSandbox({
			runtime: "node24",
			timeoutMs: planDispatchSupervision().sandboxTimeoutMs,
			source: {
				repository: config.githubRepository,
				revision: run.revision,
				cloneToken: mintResult.value.token,
			},
		});
	} catch {
		return { ok: false, code: "launch-failed", message: "Sandbox creation failed." };
	}
	if (createResult.ok === false) {
		return { ok: false, code: "launch-failed", message: "Sandbox creation failed." };
	}
	if (!isSafeSandboxName(createResult.sandboxName)) {
		// Without a usable name the later steps cannot reattach to poll, land,
		// or stop; the sandbox timeout is the cleanup backstop.
		return {
			ok: false,
			code: "launch-failed",
			message: "Sandbox name was unusable; the sandbox timeout is the cleanup backstop.",
		};
	}
	const sandboxName = createResult.sandboxName;

	// Harness choice is repo configuration at the dispatched SHA: the
	// checkout's root ns.toml is only readable once the sandbox exists, so
	// the remaining configuration checks run post-creation and stop the
	// sandbox on failure rather than leak it until the sandbox timeout.
	let settingsRead: ReadDispatchSandboxFileResult;
	try {
		settingsRead = await sandboxes.readSandboxFile({
			sandboxName,
			path: DISPATCH_SETTINGS_PATH,
		});
	} catch {
		settingsRead = { ok: false };
	}
	if (settingsRead.ok === false) {
		await stopSandboxBestEffort(sandboxes, sandboxName);
		return {
			ok: false,
			code: "launch-failed",
			message: "Reading the checkout's dispatch settings failed.",
		};
	}

	const harnessResult = deps.resolveHarnessInvocation(settingsRead.content);
	if (harnessResult.ok === false) {
		await stopSandboxBestEffort(sandboxes, sandboxName);
		// Non-secret by contract: the resolver's message describes versioned
		// ns.toml configuration, never an environment value.
		return { ok: false, code: "dispatch-misconfigured", message: harnessResult.message };
	}
	const harness = harnessResult.value;

	const launchEnvResult = resolveLaunchEnvironment(harness, deps.environment);
	if (launchEnvResult.ok === false) {
		await stopSandboxBestEffort(sandboxes, sandboxName);
		return {
			ok: false,
			code: "dispatch-misconfigured",
			// Variable name only — never an environment value.
			message: `Dispatch configuration is invalid: ${launchEnvResult.variable}.`,
		};
	}

	const prepared = await provisionAndLaunchHarness({
		sandboxName,
		sandboxes,
		harness,
		prompt: run.prompt,
		launchEnv: launchEnvResult.value,
	});
	if (prepared.ok === false) {
		// The sandbox exists but the harness never started: stop it now rather
		// than leak it until the sandbox timeout.
		await stopSandboxBestEffort(sandboxes, sandboxName);
		return { ok: false, code: "launch-failed", message: prepared.message };
	}

	return { ok: true, sandboxName };
}

async function stopSandboxBestEffort(
	sandboxes: DispatchSandboxGateway,
	sandboxName: string,
): Promise<void> {
	try {
		await sandboxes.stopSandbox({ sandboxName });
	} catch {
		// Best effort; the sandbox timeout is the cleanup backstop.
	}
}

type LaunchEnvironmentResolution =
	| { readonly ok: true; readonly value: Readonly<Record<string, string>> }
	| { readonly ok: false; readonly variable: string };

function resolveLaunchEnvironment(
	harness: HarnessInvocation,
	environment: MintEnvironment,
): LaunchEnvironmentResolution {
	const values: Record<string, string> = {};
	for (const name of harness.launchEnvironmentVariableNames) {
		const value = environment[name];
		if (value === undefined || value.length === 0) return { ok: false, variable: name };
		values[name] = value;
	}
	return { ok: true, value: values };
}

async function provisionAndLaunchHarness(options: {
	readonly sandboxName: string;
	readonly sandboxes: DispatchSandboxGateway;
	readonly harness: HarnessInvocation;
	readonly prompt: string;
	readonly launchEnv: Readonly<Record<string, string>>;
}): Promise<{ readonly ok: true } | { readonly ok: false; readonly message: string }> {
	const { sandboxName, sandboxes, harness } = options;
	try {
		const writeResult = await sandboxes.writeSandboxFile({
			sandboxName,
			path: DISPATCH_PROMPT_PATH,
			content: options.prompt,
		});
		if (writeResult.ok === false) {
			return { ok: false, message: "Writing the dispatched prompt into the sandbox failed." };
		}
		for (const command of harness.provisionCommands) {
			const provisionResult = await sandboxes.runSandboxCommand({ sandboxName, command });
			if (provisionResult.ok === false || provisionResult.exitCode !== 0) {
				return { ok: false, message: "Harness provisioning failed." };
			}
		}
		const launchResult = await sandboxes.runDetachedSandboxCommand({
			sandboxName,
			command: harness.launchCommand,
			env: options.launchEnv,
		});
		if (launchResult.ok === false) {
			return { ok: false, message: "Detached harness launch failed." };
		}
		return { ok: true };
	} catch {
		return { ok: false, message: "Harness provisioning failed." };
	}
}

/**
 * Read the harness's completion signal. Read-only and safe to re-run. A
 * present result file — valid or not — reads as `done`: the detached run
 * has finished, and `readDispatchOutcome` decides what it means.
 */
export async function pollDispatchRun(
	options: { readonly sandboxName: string },
	deps: DispatchStepDeps = defaultDispatchStepDeps(),
): Promise<SupervisionPollResult> {
	let readResult: ReadDispatchSandboxFileResult;
	try {
		readResult = await deps.createSandboxGateway().readSandboxFile({
			sandboxName: options.sandboxName,
			path: DISPATCH_RESULT_PATH,
		});
	} catch {
		return { ok: false, code: "poll-failed", message: "Dispatch result read failed." };
	}
	if (readResult.ok === false) {
		return { ok: false, code: "poll-failed", message: "Dispatch result read failed." };
	}
	const result = parseDispatchHarnessResult(readResult.content);
	return { ok: true, phase: result.phase === "running" ? "running" : "done", ticks: 0 };
}

/**
 * Harvest the finished run's outcome and decision log. Read-only and safe
 * to re-run. A decision-log read failure degrades to `null` rather than
 * failing the run — the log is reporting content, not run state.
 */
export async function readDispatchOutcome(
	options: { readonly sandboxName: string },
	deps: DispatchStepDeps = defaultDispatchStepDeps(),
): Promise<DispatchOutcomeReadResult> {
	const sandboxes = deps.createSandboxGateway();
	let resultRead: ReadDispatchSandboxFileResult;
	try {
		resultRead = await sandboxes.readSandboxFile({
			sandboxName: options.sandboxName,
			path: DISPATCH_RESULT_PATH,
		});
	} catch {
		return { ok: false };
	}
	if (resultRead.ok === false) {
		return { ok: false };
	}
	const parsed = parseDispatchHarnessResult(resultRead.content);
	// The poll loop reported done, so a now-missing file is as untrustworthy
	// as a malformed one.
	if (parsed.phase !== "finished") {
		return { ok: true, outcome: "invalid", decisionLog: null };
	}

	let decisionLog: string | null = null;
	try {
		const logRead = await sandboxes.readSandboxFile({
			sandboxName: options.sandboxName,
			path: DISPATCH_DECISION_LOG_PATH,
		});
		if (logRead.ok) decisionLog = logRead.content;
	} catch {
		decisionLog = null;
	}

	return {
		ok: true,
		outcome: parsed.outcome,
		...(parsed.summary === undefined ? {} : { summary: parsed.summary }),
		decisionLog,
	};
}

/**
 * Land the produced commits on the anchor branch. The landing token is
 * minted here, at landing time, and injected into the single landing
 * command's environment — it never touches the sandbox environment, the
 * journal, or this function's result. Idempotent: the command force-pushes
 * the checkout's `HEAD` to the same ref every time.
 */
export async function landDispatchRun(
	options: { readonly sandboxName: string; readonly anchorBranch: string },
	deps: DispatchStepDeps = defaultDispatchStepDeps(),
): Promise<DispatchLandingResult> {
	// Injection safety: the anchor branch is interpolated into the landing
	// command, so it is re-validated where it is used.
	if (!isValidDispatchAnchorBranch(options.anchorBranch)) {
		return { ok: false, code: "landing-failed", message: "Anchor branch name is invalid." };
	}
	const configResult = parseMintRuntimeConfig(deps.environment);
	// `=== false` rather than `!`: the Vercel builder typechecks without
	// strictNullChecks, where truthiness checks do not narrow the union.
	if (configResult.ok === false) {
		return {
			ok: false,
			code: "dispatch-misconfigured",
			// Variable name only — never an environment value.
			message: `Dispatch configuration is invalid: ${configResult.error.variable}.`,
		};
	}
	const config = configResult.value;

	const minter = deps.createDispatchTokenMinter(config);
	const mintResult = await minter.mintDispatchToken({
		repository: config.githubRepository,
		purpose: "landing",
	});
	if (mintResult.ok === false) {
		return { ok: false, code: "landing-failed", message: "Landing token mint failed." };
	}

	try {
		const commandResult = await deps.createSandboxGateway().runSandboxCommand({
			sandboxName: options.sandboxName,
			command: buildDispatchLandingCommand({
				repository: config.githubRepository,
				anchorBranch: options.anchorBranch,
			}),
			env: { [DISPATCH_LANDING_TOKEN_ENV_NAME]: mintResult.value.token },
		});
		if (commandResult.ok === false || commandResult.exitCode !== 0) {
			return { ok: false, code: "landing-failed", message: "Landing push failed." };
		}
	} catch {
		return { ok: false, code: "landing-failed", message: "Landing push failed." };
	}
	return { ok: true };
}

/**
 * Stop the sandbox. Idempotent: the gateway treats an already-stopped
 * sandbox as cleaned, so a step retry never fails on its own success.
 */
export async function cleanupDispatchRun(
	options: { readonly sandboxName: string },
	deps: DispatchStepDeps = defaultDispatchStepDeps(),
): Promise<SupervisionCleanupResult> {
	let stopResult: StopDispatchSandboxResult;
	try {
		stopResult = await deps.createSandboxGateway().stopSandbox({
			sandboxName: options.sandboxName,
		});
	} catch {
		return { ok: false, code: "sandbox-cleanup-failed", message: "Sandbox cleanup failed." };
	}
	if (stopResult.ok === false) {
		return { ok: false, code: "sandbox-cleanup-failed", message: "Sandbox cleanup failed." };
	}
	return { ok: true };
}

/**
 * Publish the decision log into the anchor PR description. Idempotent per
 * the report gateway contract (marked-section replacement).
 */
export async function reportDispatchLanded(
	options: { readonly anchorPrNumber: number; readonly decisionLog: string | null },
	deps: DispatchStepDeps = defaultDispatchStepDeps(),
): Promise<DispatchReportResult> {
	const gateway = createReportGateway(deps);
	if (gateway === null) return { ok: false };
	try {
		return await gateway.publishAnchorPrDecisionLog({
			anchorPrNumber: options.anchorPrNumber,
			decisionLog: options.decisionLog,
		});
	} catch {
		return { ok: false };
	}
}

/**
 * Mark the anchor PR failed with the marked failure comment, leaving the
 * PR open for triage. Idempotent per the report gateway contract (the
 * marker is checked before posting).
 */
export async function reportDispatchFailure(
	options: {
		readonly anchorPrNumber: number;
		readonly anchorBranch: string;
		readonly code: DispatchRunFailureCode;
		readonly message: string;
	},
	deps: DispatchStepDeps = defaultDispatchStepDeps(),
): Promise<DispatchReportResult> {
	const gateway = createReportGateway(deps);
	if (gateway === null) return { ok: false };
	try {
		return await gateway.ensureAnchorPrFailureComment({
			anchorPrNumber: options.anchorPrNumber,
			anchorBranch: options.anchorBranch,
			code: options.code,
			message: options.message,
		});
	} catch {
		return { ok: false };
	}
}

function createReportGateway(deps: DispatchStepDeps): DispatchReportGateway | null {
	const configResult = parseMintRuntimeConfig(deps.environment);
	// `=== false` rather than `!`: the Vercel builder typechecks without
	// strictNullChecks, where truthiness checks do not narrow the union.
	if (configResult.ok === false) return null;
	const config = configResult.value;
	return deps.createReportGateway({
		config,
		minter: deps.createDispatchTokenMinter(config),
	});
}

function isSafeSandboxName(name: string): boolean {
	return /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(name);
}
