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
import type { Clock } from "@nseng-ai/foundation/clock";
import { optionalEntries } from "@nseng-ai/foundation/primitives";
import { systemClock } from "@nseng-ai/foundation/time";

import type { DispatchTokenMinter } from "../mint/mint-core.ts";
import { createGitHubAppDispatchTokenMinter } from "../mint/real-gateways.ts";
import {
	parseGitHubAppMintConfig,
	type GitHubAppMintConfig,
	type MintEnvironment,
} from "../mint/runtime-config.ts";
import type { SupervisionCleanupResult, SupervisionPollResult } from "../sandbox/supervision.ts";
import { isSafeSandboxName, type SandboxCommand } from "../sandbox/contracts.ts";
import type { DispatchReportGateway } from "./anchor-pr-report.ts";
import { normalizeDispatchFailure, type DispatchFailureDiagnostic } from "./failure-diagnostic.ts";
import {
	buildDispatchBrmemFetchAllCommand,
	buildDispatchHarnessInstruction,
	buildDispatchInstructionCheckCommand,
	buildDispatchLandingCommand,
	DISPATCH_DECISION_LOG_PATH,
	DISPATCH_LANDING_TOKEN_ENV_NAME,
	DISPATCH_PROMPT_PATH,
	DISPATCH_RESULT_PATH,
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
	DISPATCH_PACKAGE_MANAGER_FIELD,
	DISPATCH_PACKAGE_MANIFEST_PATH,
	DISPATCH_SETTINGS_PATH,
	type HarnessInvocation,
} from "./harness-registry.ts";
import {
	resolveConfiguredHarnessInvocation,
	type HarnessInvocationResolver,
} from "./harness-invocation.ts";
import { createGitHubDispatchReportGateway } from "./real-dispatch-report-gateway.ts";
import { createRealDispatchSandboxGateway } from "./real-dispatch-sandbox-gateway.ts";
import { withOperation, type OperationLogSink } from "./with-operation.ts";

export interface DispatchStepDeps {
	readonly environment: MintEnvironment;
	readonly createDispatchTokenMinter: (config: GitHubAppMintConfig) => DispatchTokenMinter;
	readonly createSandboxGateway: () => DispatchSandboxGateway;
	readonly createReportGateway: (options: {
		readonly repository: string;
		readonly minter: DispatchTokenMinter;
	}) => DispatchReportGateway;
	readonly resolveHarnessInvocation: HarnessInvocationResolver;
	readonly operationClock: Clock;
	readonly operationLogSink: OperationLogSink;
}

export function defaultDispatchStepDeps(): DispatchStepDeps {
	return {
		environment: process.env,
		createDispatchTokenMinter: (config) => createGitHubAppDispatchTokenMinter(config),
		createSandboxGateway: () => createRealDispatchSandboxGateway(),
		createReportGateway: ({ repository, minter }) =>
			createGitHubDispatchReportGateway({ repository, minter }),
		resolveHarnessInvocation: resolveConfiguredHarnessInvocation,
		operationClock: systemClock,
		operationLogSink: console.info,
	};
}

/**
 * Create the dispatch sandbox over the exact dispatched SHA and launch the
 * configured harness detached inside it. Everything that can be checked
 * before the billable sandbox exists is checked first (LBYL: input, runtime
 * configuration). Harness and package-manager configuration live in the
 * checkout's own `ns.toml` and `ts/package.json` at the dispatched SHA, so
 * the invocation and launch environment can only be resolved once the
 * sandbox exists. Every post-creation failure returns the safe sandbox name;
 * workflow orchestration owns cleanup and cleanup-failure precedence.
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

	const appConfigResult = parseGitHubAppMintConfig(deps.environment);
	if (appConfigResult.ok === false) {
		return {
			ok: false,
			code: "dispatch-misconfigured",
			// Variable name only — never an environment value.
			message: `Dispatch configuration is invalid: ${appConfigResult.error.variable}.`,
		};
	}
	const appConfig = appConfigResult.value;

	const mintContext = await createDispatchMintContext(deps, appConfig, {
		operation: "create_clone_token_minter",
		context: { repository: appConfig.githubRepository, anchorPrNumber: run.anchorPrNumber },
	});
	if (mintContext === null) {
		return { ok: false, code: "launch-failed", message: "Clone token mint failed." };
	}
	let mintResult;
	try {
		mintResult = await runOperation(
			deps,
			{
				operation: "mint_clone_token",
				context: {
					repository: mintContext.repository,
					purpose: "clone",
					anchorPrNumber: run.anchorPrNumber,
				},
				failure: (result) => mintOperationFailure("mint_clone_token", result),
			},
			async () =>
				await mintContext.minter.mintDispatchToken({
					repository: mintContext.repository,
					purpose: "clone",
				}),
		);
	} catch (error) {
		return {
			ok: false,
			code: "launch-failed",
			message: "Clone token mint failed.",
			diagnostic: diagnosticFromThrown("mint_clone_token", error),
		};
	}
	if (mintResult.ok === false) {
		return {
			ok: false,
			code: "launch-failed",
			message: "Clone token mint failed.",
			diagnostic: diagnosticFromMintFailure("mint_clone_token", mintResult),
		};
	}

	let sandboxCreation: {
		readonly sandboxes: DispatchSandboxGateway;
		readonly result: CreateDispatchSandboxResult;
	};
	try {
		sandboxCreation = await runOperation(
			deps,
			{
				operation: "create_sandbox",
				context: {
					repository: appConfig.githubRepository,
					revision: run.revision,
					anchorPrNumber: run.anchorPrNumber,
				},
				failureMessage: ({ result }) => (result.ok ? undefined : "Sandbox creation failed"),
			},
			async () => {
				const sandboxes = deps.createSandboxGateway();
				const result = await sandboxes.createDispatchSandbox({
					runtime: "node24",
					timeoutMs: planDispatchSupervision().sandboxTimeoutMs,
					source: {
						repository: appConfig.githubRepository,
						revision: run.revision,
						cloneToken: mintResult.value.token,
					},
				});
				return { sandboxes, result };
			},
		);
	} catch (error) {
		return {
			ok: false,
			code: "launch-failed",
			message: "Sandbox creation failed.",
			diagnostic: diagnosticFromThrown("create_sandbox", error),
		};
	}
	const { sandboxes, result: createResult } = sandboxCreation;
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

	// Invocation inputs are repo configuration at the dispatched SHA. Read
	// settings first and the package manifest second, then resolve only from
	// those checkout-owned sources; every failure stops the sandbox.
	let settingsRead: ReadDispatchSandboxFileResult;
	try {
		settingsRead = await runOperation(
			deps,
			{
				operation: "read_dispatch_settings",
				context: { sandboxName, path: DISPATCH_SETTINGS_PATH },
				failureMessage: readFailureMessage,
			},
			async () => await sandboxes.readSandboxFile({ sandboxName, path: DISPATCH_SETTINGS_PATH }),
		);
	} catch {
		settingsRead = { ok: false };
	}
	if (settingsRead.ok === false) {
		return {
			ok: false,
			code: "dispatch-misconfigured",
			message: `Dispatch configuration is invalid: ${DISPATCH_SETTINGS_PATH} could not be read from the dispatched checkout.`,
			sandboxName,
		};
	}

	let packageManagerRead: ReadDispatchSandboxFileResult;
	try {
		packageManagerRead = await runOperation(
			deps,
			{
				operation: "read_dispatch_package_manifest",
				context: { sandboxName, path: DISPATCH_PACKAGE_MANIFEST_PATH },
				failureMessage: readFailureMessage,
			},
			async () =>
				await sandboxes.readSandboxFile({ sandboxName, path: DISPATCH_PACKAGE_MANIFEST_PATH }),
		);
	} catch {
		packageManagerRead = { ok: false };
	}
	if (packageManagerRead.ok === false) {
		return {
			ok: false,
			code: "dispatch-misconfigured",
			message: `Dispatch configuration is invalid: ${DISPATCH_PACKAGE_MANAGER_FIELD} could not be read from the dispatched checkout.`,
			sandboxName,
		};
	}

	const harnessResult = deps.resolveHarnessInvocation(
		settingsRead.content,
		packageManagerRead.content,
	);
	if (harnessResult.ok === false) {
		// Non-secret by contract: the resolver's message describes checkout-owned
		// configuration, never a source value or environment value.
		return {
			ok: false,
			code: "dispatch-misconfigured",
			message: harnessResult.message,
			sandboxName,
		};
	}
	const harness = harnessResult.value;

	const launchEnvResult = resolveLaunchEnvironment(harness, deps.environment);
	if (launchEnvResult.ok === false) {
		return {
			ok: false,
			code: "dispatch-misconfigured",
			// Variable name only — never an environment value.
			message: `Dispatch configuration is invalid: ${launchEnvResult.variable}.`,
			sandboxName,
		};
	}

	const prepared = await provisionAndLaunchDispatchHarness({
		sandboxName,
		sandboxes,
		harness,
		instructionLocator: run.instructionLocator,
		launchEnv: launchEnvResult.value,
		deps,
	});
	if (prepared.ok === false) {
		return {
			ok: false,
			code: "launch-failed",
			message: prepared.message,
			sandboxName,
		};
	}

	return { ok: true, sandboxName, harness: harness.harness };
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

type HarnessLaunchStageResult =
	| { readonly ok: true }
	| { readonly ok: false; readonly message: string };

async function provisionAndLaunchDispatchHarness(options: {
	readonly sandboxName: string;
	readonly sandboxes: DispatchSandboxGateway;
	readonly harness: HarnessInvocation;
	readonly instructionLocator: import("./dispatch-context.ts").DispatchInstructionLocator;
	readonly launchEnv: Readonly<Record<string, string>>;
	readonly deps: DispatchStepDeps;
}): Promise<HarnessLaunchStageResult> {
	const provision = await provisionDispatchHarness(options);
	if (provision.ok === false) return provision;
	const fetched = await runInstructionPrecheck({
		...options,
		command: buildDispatchBrmemFetchAllCommand(options.instructionLocator),
		failureMessage: "Branch Memory fetch and pinned instruction Snapshot verification failed.",
		operation: "fetch_branch_memory_refs",
	});
	if (fetched.ok === false) return fetched;
	const checked = await runInstructionPrecheck({
		...options,
		command: buildDispatchInstructionCheckCommand(options.instructionLocator),
		failureMessage: "Required Branch Memory instruction Entry check failed.",
		operation: "check_dispatch_instruction",
	});
	if (checked.ok === false) return checked;
	const prompt = await writeDispatchPrompt({
		...options,
		prompt: buildDispatchHarnessInstruction(options.instructionLocator),
	});
	if (prompt.ok === false) return prompt;
	return await launchDetachedDispatchHarness(options);
}

interface InstructionPrecheckOptions {
	readonly sandboxName: string;
	readonly sandboxes: DispatchSandboxGateway;
	readonly deps: DispatchStepDeps;
	readonly command: SandboxCommand;
	readonly failureMessage: string;
	readonly operation: string;
}

async function runInstructionPrecheck(
	options: InstructionPrecheckOptions,
): Promise<HarnessLaunchStageResult> {
	try {
		const result = await runOperation(
			options.deps,
			{
				operation: options.operation,
				context: { sandboxName: options.sandboxName },
				failureMessage: commandFailureMessage,
			},
			async () =>
				await options.sandboxes.runSandboxCommand({
					sandboxName: options.sandboxName,
					command: options.command,
				}),
		);
		return result.ok && result.exitCode === 0
			? { ok: true }
			: { ok: false, message: options.failureMessage };
	} catch {
		return { ok: false, message: options.failureMessage };
	}
}

async function writeDispatchPrompt(options: {
	readonly sandboxName: string;
	readonly sandboxes: DispatchSandboxGateway;
	readonly prompt: string;
	readonly deps: DispatchStepDeps;
}): Promise<HarnessLaunchStageResult> {
	try {
		const result = await runOperation(
			options.deps,
			{
				operation: "write_dispatch_prompt",
				context: { sandboxName: options.sandboxName, path: DISPATCH_PROMPT_PATH },
				failureMessage: (value) => (value.ok ? undefined : "Prompt write failed"),
			},
			async () =>
				await options.sandboxes.writeSandboxFile({
					sandboxName: options.sandboxName,
					path: DISPATCH_PROMPT_PATH,
					content: options.prompt,
				}),
		);
		return result.ok
			? { ok: true }
			: { ok: false, message: "Writing the dispatched prompt into the sandbox failed." };
	} catch {
		return { ok: false, message: "Writing the dispatched prompt into the sandbox failed." };
	}
}

async function provisionDispatchHarness(options: {
	readonly sandboxName: string;
	readonly sandboxes: DispatchSandboxGateway;
	readonly harness: HarnessInvocation;
	readonly deps: DispatchStepDeps;
}): Promise<HarnessLaunchStageResult> {
	for (const [ordinal, command] of options.harness.provisionCommands.entries()) {
		try {
			const result = await runOperation(
				options.deps,
				{
					operation: "provision_dispatch_harness",
					context: {
						sandboxName: options.sandboxName,
						harness: options.harness.harness,
						ordinal: ordinal + 1,
					},
					failureMessage: commandFailureMessage,
				},
				async () =>
					await options.sandboxes.runSandboxCommand({
						sandboxName: options.sandboxName,
						command,
					}),
			);
			if (result.ok === false || result.exitCode !== 0) {
				return { ok: false, message: "Harness provisioning failed." };
			}
		} catch {
			return { ok: false, message: "Harness provisioning failed." };
		}
	}
	return { ok: true };
}

async function launchDetachedDispatchHarness(options: {
	readonly sandboxName: string;
	readonly sandboxes: DispatchSandboxGateway;
	readonly harness: HarnessInvocation;
	readonly launchEnv: Readonly<Record<string, string>>;
	readonly deps: DispatchStepDeps;
}): Promise<HarnessLaunchStageResult> {
	try {
		const result = await runOperation(
			options.deps,
			{
				operation: "launch_detached_dispatch_harness",
				context: { sandboxName: options.sandboxName, harness: options.harness.harness },
				failureMessage: (value) => (value.ok ? undefined : "Detached launch failed"),
			},
			async () =>
				await options.sandboxes.runDetachedSandboxCommand({
					sandboxName: options.sandboxName,
					command: options.harness.launchCommand,
					env: options.launchEnv,
				}),
		);
		return result.ok ? { ok: true } : { ok: false, message: "Detached harness launch failed." };
	} catch {
		return { ok: false, message: "Detached harness launch failed." };
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
): Promise<SupervisionPollResult<DispatchFailureDiagnostic>> {
	let readResult: ReadDispatchSandboxFileResult;
	try {
		readResult = await runOperation(
			deps,
			{
				operation: "poll_dispatch_result",
				context: { sandboxName: options.sandboxName, path: DISPATCH_RESULT_PATH },
				failureMessage: readFailureMessage,
			},
			async () =>
				await deps.createSandboxGateway().readSandboxFile({
					sandboxName: options.sandboxName,
					path: DISPATCH_RESULT_PATH,
				}),
		);
	} catch (error) {
		return {
			ok: false,
			code: "poll-failed",
			message: "Dispatch result read failed.",
			diagnostic: diagnosticFromThrown("poll_dispatch_result", error),
		};
	}
	if (readResult.ok === false) {
		return { ok: false, code: "poll-failed", message: "Dispatch result read failed." };
	}
	const result = parseDispatchHarnessResult(readResult.content);
	return { ok: true, phase: result.phase === "running" ? "running" : "done" };
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
	let resultReadWithGateway: {
		readonly sandboxes: DispatchSandboxGateway;
		readonly result: ReadDispatchSandboxFileResult;
	};
	try {
		resultReadWithGateway = await runOperation(
			deps,
			{
				operation: "read_final_dispatch_result",
				context: { sandboxName: options.sandboxName, path: DISPATCH_RESULT_PATH },
				failureMessage: ({ result }) => readFailureMessage(result),
			},
			async () => {
				const sandboxes = deps.createSandboxGateway();
				const result = await sandboxes.readSandboxFile({
					sandboxName: options.sandboxName,
					path: DISPATCH_RESULT_PATH,
				});
				return { sandboxes, result };
			},
		);
	} catch {
		return { ok: false };
	}
	const { sandboxes, result: resultRead } = resultReadWithGateway;
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
		const logRead = await runOperation(
			deps,
			{
				operation: "read_dispatch_decision_log",
				context: { sandboxName: options.sandboxName, path: DISPATCH_DECISION_LOG_PATH },
				failureMessage: readFailureMessage,
			},
			async () =>
				await sandboxes.readSandboxFile({
					sandboxName: options.sandboxName,
					path: DISPATCH_DECISION_LOG_PATH,
				}),
		);
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
	const appConfigResult = parseGitHubAppMintConfig(deps.environment);
	// `=== false` rather than `!`: the Vercel builder typechecks without
	// strictNullChecks, where truthiness checks do not narrow the union.
	if (appConfigResult.ok === false) {
		return {
			ok: false,
			code: "dispatch-misconfigured",
			// Variable name only — never an environment value.
			message: `Dispatch configuration is invalid: ${appConfigResult.error.variable}.`,
		};
	}
	const appConfig = appConfigResult.value;

	const mintContext = await createDispatchMintContext(deps, appConfig, {
		operation: "create_landing_token_minter",
		context: { repository: appConfig.githubRepository },
	});
	if (mintContext === null) {
		return { ok: false, code: "landing-failed", message: "Landing token mint failed." };
	}
	let mintResult;
	try {
		mintResult = await runOperation(
			deps,
			{
				operation: "mint_landing_token",
				context: { repository: mintContext.repository, purpose: "landing" },
				failure: (result) => mintOperationFailure("mint_landing_token", result),
			},
			async () =>
				await mintContext.minter.mintDispatchToken({
					repository: mintContext.repository,
					purpose: "landing",
				}),
		);
	} catch (error) {
		return {
			ok: false,
			code: "landing-failed",
			message: "Landing token mint failed.",
			diagnostic: diagnosticFromThrown("mint_landing_token", error),
		};
	}
	if (mintResult.ok === false) {
		return {
			ok: false,
			code: "landing-failed",
			message: "Landing token mint failed.",
			diagnostic: diagnosticFromMintFailure("mint_landing_token", mintResult),
		};
	}

	try {
		const commandResult = await runOperation(
			deps,
			{
				operation: "push_anchor_branch",
				context: {
					sandboxName: options.sandboxName,
					repository: appConfig.githubRepository,
					anchorBranch: options.anchorBranch,
				},
				failureMessage: commandFailureMessage,
			},
			async () =>
				await deps.createSandboxGateway().runSandboxCommand({
					sandboxName: options.sandboxName,
					command: buildDispatchLandingCommand({
						repository: appConfig.githubRepository,
						anchorBranch: options.anchorBranch,
					}),
					env: { [DISPATCH_LANDING_TOKEN_ENV_NAME]: mintResult.value.token },
				}),
		);
		if (commandResult.ok === false || commandResult.exitCode !== 0) {
			return { ok: false, code: "landing-failed", message: "Landing push failed." };
		}
	} catch (error) {
		return {
			ok: false,
			code: "landing-failed",
			message: "Landing push failed.",
			diagnostic: diagnosticFromThrown("push_anchor_branch", error),
		};
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
): Promise<SupervisionCleanupResult<DispatchFailureDiagnostic>> {
	let stopResult: StopDispatchSandboxResult;
	try {
		stopResult = await runOperation(
			deps,
			{
				operation: "stop_sandbox",
				context: { sandboxName: options.sandboxName },
				failureMessage: (result) => (result.ok ? undefined : "Sandbox stop failed"),
			},
			async () =>
				await deps.createSandboxGateway().stopSandbox({ sandboxName: options.sandboxName }),
		);
	} catch (error) {
		return {
			ok: false,
			code: "sandbox-cleanup-failed",
			message: "Sandbox cleanup failed.",
			diagnostic: diagnosticFromThrown("stop_sandbox", error),
		};
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
	return await withReportGateway({
		deps,
		operationName: "publish_anchor_pr_decision_log",
		anchorPrNumber: options.anchorPrNumber,
		operation: async (gateway) =>
			await gateway.publishAnchorPrDecisionLog({
				anchorPrNumber: options.anchorPrNumber,
				decisionLog: options.decisionLog,
			}),
	});
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
		readonly diagnostic?: DispatchFailureDiagnostic;
		readonly workflowRunId?: string;
	},
	deps: DispatchStepDeps = defaultDispatchStepDeps(),
): Promise<DispatchReportResult> {
	return await withReportGateway({
		deps,
		operationName: "publish_anchor_pr_failure_comment",
		anchorPrNumber: options.anchorPrNumber,
		operation: async (gateway) =>
			await gateway.ensureAnchorPrFailureComment({
				anchorPrNumber: options.anchorPrNumber,
				anchorBranch: options.anchorBranch,
				code: options.code,
				message: options.message,
				...(options.diagnostic === undefined ? {} : { diagnostic: options.diagnostic }),
				...(options.workflowRunId === undefined ? {} : { workflowRunId: options.workflowRunId }),
			}),
	});
}

interface WithReportGatewayOptions {
	readonly deps: DispatchStepDeps;
	readonly operationName: string;
	readonly anchorPrNumber: number;
	readonly operation: (gateway: DispatchReportGateway) => Promise<DispatchReportResult>;
}

async function withReportGateway(options: WithReportGatewayOptions): Promise<DispatchReportResult> {
	try {
		const result = await runOperation(
			options.deps,
			{
				operation: options.operationName,
				context: { anchorPrNumber: options.anchorPrNumber },
				failureMessage: (value) =>
					value.ok ? undefined : (value.message ?? "Anchor PR reporting failed"),
			},
			async (): Promise<DispatchReportResult> => {
				const gateway = await createReportGateway(options.deps);
				if (gateway === null) return { ok: false };
				return await options.operation(gateway);
			},
		);
		return result.ok ? { ok: true } : { ok: false };
	} catch {
		return { ok: false };
	}
}

async function createReportGateway(deps: DispatchStepDeps): Promise<DispatchReportGateway | null> {
	const appConfigResult = parseGitHubAppMintConfig(deps.environment);
	// `=== false` rather than `!`: the Vercel builder typechecks without
	// strictNullChecks, where truthiness checks do not narrow the union.
	if (appConfigResult.ok === false) return null;
	const mintContext = await createDispatchMintContext(deps, appConfigResult.value, {
		operation: "create_report_token_minter",
		context: { repository: appConfigResult.value.githubRepository },
	});
	if (mintContext === null) return null;
	return deps.createReportGateway({
		repository: mintContext.repository,
		minter: mintContext.minter,
	});
}

/** Shared, value-free GitHub App/minter prologue for launch, land, and report stages. */
async function createDispatchMintContext(
	deps: DispatchStepDeps,
	config: GitHubAppMintConfig,
	log: {
		readonly operation: string;
		readonly context: Readonly<Record<string, string | number | boolean>>;
	},
): Promise<{ readonly repository: string; readonly minter: DispatchTokenMinter } | null> {
	try {
		return await runOperation(deps, log, async () => ({
			repository: config.githubRepository,
			minter: deps.createDispatchTokenMinter(config),
		}));
	} catch {
		return null;
	}
}

interface RunOperationOptions<T> {
	readonly operation: string;
	readonly context?: Readonly<Record<string, string | number | boolean>>;
	readonly failure?: (result: T) => { readonly diagnostic: DispatchFailureDiagnostic } | undefined;
	readonly failureMessage?: (result: T) => string | undefined;
}

async function runOperation<T>(
	deps: DispatchStepDeps,
	options: RunOperationOptions<T>,
	run: () => Promise<T>,
): Promise<T> {
	return await withOperation(
		{
			operation: options.operation,
			...optionalEntries({
				context: options.context,
				failure: options.failure,
				failureMessage: options.failureMessage,
			}),
			clock: deps.operationClock,
			logSink: deps.operationLogSink,
		},
		run,
	);
}

function mintOperationFailure(
	operation: string,
	result: Awaited<ReturnType<DispatchTokenMinter["mintDispatchToken"]>>,
): { readonly diagnostic: DispatchFailureDiagnostic } | undefined {
	if (result.ok) return undefined;
	return { diagnostic: diagnosticFromMintFailure(operation, result) };
}

function diagnosticFromMintFailure(
	operation: string,
	result: Extract<
		Awaited<ReturnType<DispatchTokenMinter["mintDispatchToken"]>>,
		{ readonly ok: false }
	>,
): DispatchFailureDiagnostic {
	return normalizeDispatchFailure({
		operation,
		reason: result.error.reason ?? result.error.code,
		errorCode: result.error.code,
		...(result.error.message === undefined ? {} : { message: result.error.message }),
	});
}

function diagnosticFromThrown(operation: string, error: unknown): DispatchFailureDiagnostic {
	return normalizeDispatchFailure({ operation, reason: "unexpected-exception", error });
}

function readFailureMessage(result: ReadDispatchSandboxFileResult): string | undefined {
	return result.ok ? undefined : "Sandbox file read failed";
}

function commandFailureMessage(result: {
	readonly ok: boolean;
	readonly exitCode?: number;
}): string | undefined {
	if (!result.ok) return "Sandbox command failed";
	return result.exitCode === undefined || result.exitCode === 0
		? undefined
		: `Sandbox command exited with code ${result.exitCode}`;
}
