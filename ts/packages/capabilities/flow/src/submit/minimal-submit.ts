import { deriveValidatedGraphiteStackPath } from "@nseng-ai/capability-kit/graphite/stack";
import type {
	GraphiteStackGateway,
	GraphiteStackPathFailure,
} from "@nseng-ai/capability-kit/graphite/stack";

import type {
	CurrentPrVerificationResult,
	SubmitPreflightResult,
	SubmitRestackResult,
	SubmitRunResult,
} from "./submit-contracts.ts";
import {
	prepareSubmitTransport,
	type SubmitTransportGateway,
	type SubmitTransportObservation,
	type SubmitTransportReady,
} from "./submit-transport.ts";

export const FLOW_MINIMAL_SUBMIT_MAX_DIRTY_PATHS = 50;

export type FlowMinimalSubmitStage =
	| "planning"
	| "readiness"
	| "restack"
	| "readiness-recheck"
	| "submit"
	| "verification";

export type FlowMinimalSubmitMutationState = "none" | "observed" | "possible";

export interface FlowMinimalSubmitMutationEvidence {
	readonly local: FlowMinimalSubmitMutationState;
	readonly remote: FlowMinimalSubmitMutationState;
}

export interface FlowMinimalSubmitSource {
	readonly branch: string;
	readonly headSha: string;
}

export interface FlowMinimalSubmitPlan {
	readonly source: FlowMinimalSubmitSource;
	readonly trunkBranch: string;
	/** Current branch followed by its non-trunk downstack ancestors, nearest first. */
	readonly affectedBranches: readonly string[];
}

export type FlowMinimalSubmitErrorCode =
	| "flow-minimal-submit-after-observation-failed"
	| "flow-minimal-submit-branch-drift"
	| "flow-minimal-submit-branch-read-failed"
	| "flow-minimal-submit-dirty-worktree"
	| "flow-minimal-submit-head-drift"
	| "flow-minimal-submit-head-read-failed"
	| "flow-minimal-submit-not-graphite-tracked"
	| "flow-minimal-submit-observation-failed"
	| "flow-minimal-submit-observation-incomplete"
	| "flow-minimal-submit-observation-parse-failed"
	| "flow-minimal-submit-plan-drift"
	| "flow-minimal-submit-readiness-failed"
	| "flow-minimal-submit-readiness-recheck-failed"
	| "flow-minimal-submit-remote-observation-failed"
	| "flow-minimal-submit-remote-observation-incomplete"
	| "flow-minimal-submit-remote-observation-parse-failed"
	| "flow-minimal-submit-restack-conflict"
	| "flow-minimal-submit-restack-failed"
	| "flow-minimal-submit-restack-required"
	| "flow-minimal-submit-restack-still-required"
	| "flow-minimal-submit-semantic-failure"
	| "flow-minimal-submit-status-read-failed"
	| "flow-minimal-submit-submit-failed"
	| "flow-minimal-submit-topology-ancestor-cycle"
	| "flow-minimal-submit-topology-ancestor-row-missing"
	| "flow-minimal-submit-topology-path-inconsistent"
	| "flow-minimal-submit-topology-provider-failure"
	| "flow-minimal-submit-topology-trunk-marker-problem"
	| "flow-minimal-submit-topology-untracked-branch"
	| "flow-minimal-submit-topology-current-mismatch"
	| "flow-minimal-submit-verification-failed"
	| "flow-minimal-submit-verification-no_current_pr";

export interface FlowMinimalSubmitError {
	readonly code: FlowMinimalSubmitErrorCode;
	readonly message: string;
	readonly displayCommand?: string;
	readonly dirtyPaths?: readonly string[];
	readonly isDirtyPathsTruncated?: boolean;
}

export type FlowMinimalSubmitPlanResult =
	| { readonly type: "tracked"; readonly plan: FlowMinimalSubmitPlan }
	| {
			readonly type: "not-graphite-tracked";
			readonly source: FlowMinimalSubmitSource;
			readonly message: string;
	  }
	| {
			readonly type: "failed";
			readonly stage: "planning";
			readonly error: FlowMinimalSubmitError;
			readonly mutation: FlowMinimalSubmitMutationEvidence;
	  };

export interface FlowMinimalSubmitPhaseEvent {
	readonly stage: FlowMinimalSubmitStage;
	readonly status: "started" | "completed" | "failed";
}

export interface FlowMinimalSubmitOutputEvent {
	readonly stream: "stdout" | "stderr";
	readonly text: string;
}

export type FlowMinimalSubmitResult =
	| {
			readonly type: "submitted";
			readonly stage: "verification";
			readonly plan: FlowMinimalSubmitPlan;
			readonly source: FlowMinimalSubmitSource;
			readonly mutation: FlowMinimalSubmitMutationEvidence;
	  }
	| {
			readonly type: "failed";
			readonly stage: FlowMinimalSubmitStage;
			readonly error: FlowMinimalSubmitError;
			readonly mutation: FlowMinimalSubmitMutationEvidence;
			readonly plan?: FlowMinimalSubmitPlan;
	  };

interface FlowMinimalSubmitExecutionOptions {
	readonly restack?: boolean;
	readonly force?: boolean;
	/** Non-controlling progress observer; callback failures do not alter submission. */
	readonly onPhase?: (event: FlowMinimalSubmitPhaseEvent) => void;
	/** Non-controlling command-output observer; callback failures do not alter submission. */
	readonly onOutput?: (event: FlowMinimalSubmitOutputEvent) => void;
}

export type FlowMinimalSubmitInput = FlowMinimalSubmitExecutionOptions &
	(
		| {
				readonly type: "planned";
				/** The complete caller-authorized plan; its source is the sole expected source. */
				readonly expectedPlan: FlowMinimalSubmitPlan;
				readonly expectedSource?: never;
		  }
		| {
				readonly type: "unplanned";
				readonly expectedSource: FlowMinimalSubmitSource;
				readonly expectedPlan?: never;
		  }
	);

export interface FlowMinimalSubmitClient {
	planCurrentBranch(input?: {
		readonly expectedSource?: FlowMinimalSubmitSource;
	}): Promise<FlowMinimalSubmitPlanResult>;
	submitCurrentBranch(input: FlowMinimalSubmitInput): Promise<FlowMinimalSubmitResult>;
}

export interface FlowMinimalSubmitGatewaySuccess<T> {
	readonly ok: true;
	readonly value: T;
}

export interface FlowMinimalSubmitGatewayFailure {
	readonly ok: false;
	readonly error: FlowMinimalSubmitError;
}

export type FlowMinimalSubmitGatewayResult<T> =
	| FlowMinimalSubmitGatewaySuccess<T>
	| FlowMinimalSubmitGatewayFailure;

export interface MinimalSubmitRepositoryInspection {
	readonly source: FlowMinimalSubmitSource;
	readonly dirtyPaths: readonly string[];
	readonly isDirtyPathsTruncated: boolean;
}

export interface MinimalSubmitRepositoryObservation extends MinimalSubmitRepositoryInspection {
	readonly localTips: Readonly<Record<string, string>>;
	readonly remoteTips: Readonly<Record<string, string | null>>;
}

export interface MinimalSubmitRepositoryGateway {
	inspectCurrent(): Promise<FlowMinimalSubmitGatewayResult<MinimalSubmitRepositoryInspection>>;
	observeAffectedBranches(
		branches: readonly string[],
	): Promise<FlowMinimalSubmitGatewayResult<MinimalSubmitRepositoryObservation>>;
}

export interface FlowMinimalSubmitContext {
	readonly repository: MinimalSubmitRepositoryGateway;
	readonly graphite: Pick<GraphiteStackGateway, "stackForBranch">;
	readonly submit: SubmitTransportGateway;
	readonly cwd: string;
}

/** Package-private construction seam for fake-driven tests and the real API factory. */
export function createFlowMinimalSubmitClientFromGateways(
	context: FlowMinimalSubmitContext,
): FlowMinimalSubmitClient {
	return {
		planCurrentBranch: async (input = {}) => await planCurrentBranch(context, input.expectedSource),
		submitCurrentBranch: async (input) => await submitCurrentBranch(context, input),
	};
}

async function planCurrentBranch(
	context: FlowMinimalSubmitContext,
	expectedSource: FlowMinimalSubmitSource | undefined,
): Promise<FlowMinimalSubmitPlanResult> {
	const inspected = await context.repository.inspectCurrent();
	if (!inspected.ok) return planningFailure(inspected.error);
	const sourceError = validateSource(inspected.value.source, expectedSource);
	if (sourceError !== undefined) return planningFailure(sourceError);
	const dirtyError = validateClean(inspected.value);
	if (dirtyError !== undefined) return planningFailure(dirtyError);

	const stackResult = await context.graphite.stackForBranch(
		context.cwd,
		inspected.value.source.branch,
	);
	if (stackResult.type === "untracked_branch") {
		return {
			type: "not-graphite-tracked",
			source: inspected.value.source,
			message: stackResult.message,
		};
	}
	const validated = deriveValidatedGraphiteStackPath(stackResult);
	if (validated.type === "failure") {
		return planningFailure({
			code: formatTopologyFailureCode(validated.failure),
			message: formatTopologyFailure(validated.failure),
		});
	}
	const affectedBranches = validated.path.slice(1).reverse();
	if (
		validated.stack.current !== inspected.value.source.branch ||
		affectedBranches[0] !== inspected.value.source.branch
	) {
		return planningFailure({
			code: "flow-minimal-submit-topology-current-mismatch",
			message: "Graphite metadata did not produce a non-trunk path rooted at the current branch.",
		});
	}
	return {
		type: "tracked",
		plan: {
			source: inspected.value.source,
			trunkBranch: validated.stack.trunk,
			affectedBranches,
		},
	};
}

async function submitCurrentBranch(
	context: FlowMinimalSubmitContext,
	input: FlowMinimalSubmitInput,
): Promise<FlowMinimalSubmitResult> {
	const expectedSource =
		input.type === "planned" ? input.expectedPlan.source : input.expectedSource;
	emitPhase(input, "planning", "started");
	const planned = await planCurrentBranch(context, expectedSource);
	if (planned.type !== "tracked") {
		emitPhase(input, "planning", "failed");
		if (planned.type === "failed") return planned;
		return executionFailure("planning", {
			code: "flow-minimal-submit-not-graphite-tracked",
			message: planned.message,
		});
	}
	const plan = planned.plan;
	if (input.type === "planned" && !submitPlansEqual(plan, input.expectedPlan)) {
		emitPhase(input, "planning", "failed");
		return executionFailure(
			"planning",
			{
				code: "flow-minimal-submit-plan-drift",
				message:
					"Graphite submit scope changed after planning; review and authorize the refreshed plan before submitting.",
			},
			noMutation(),
			plan,
		);
	}
	const before = await context.repository.observeAffectedBranches(plan.affectedBranches);
	if (!before.ok) {
		emitPhase(input, "planning", "failed");
		return executionFailure("planning", before.error, noMutation(), plan);
	}
	const beforeError = validateObservationBefore(before.value, expectedSource);
	if (beforeError !== undefined) {
		emitPhase(input, "planning", "failed");
		return executionFailure("planning", beforeError, noMutation(), plan);
	}
	emitPhase(input, "planning", "completed");

	const commandParams = {
		cwd: context.cwd,
		...(input.force === true ? { force: true } : {}),
		...(input.onOutput === undefined
			? {}
			: {
					onOutput: (stream: "stdout" | "stderr", text: string) =>
						notifyObserver(input.onOutput, { stream, text }),
				}),
	};

	const transportPhases = createMinimalTransportPhaseController(input);
	const preparation = await prepareSubmitTransport({
		gateway: context.submit,
		params: commandParams,
		observationSink: transportPhases.observe,
	});
	if (preparation.kind === "failed") {
		transportPhases.fail("readiness");
		return executionFailure(
			"readiness",
			submitError("readiness", preparation.outcome),
			noMutation(),
			plan,
		);
	}
	transportPhases.complete("readiness");

	let readyTransport: SubmitTransportReady;
	if (preparation.kind === "restack-required") {
		if (input.restack === false) {
			return executionFailure(
				"readiness",
				{
					code: "flow-minimal-submit-restack-required",
					message: "Graphite requires a restack, but automatic restacking is disabled.",
				},
				noMutation(),
				plan,
			);
		}
		const restacked = await preparation.restackAndRecheck({
			restack: commandParams,
			readinessRecheck: commandParams,
		});
		if (restacked.kind === "failed") {
			transportPhases.fail(restacked.stage);
			return await failureAfterMutation({
				context,
				before: before.value,
				plan,
				stage: restacked.stage,
				error:
					restacked.stage === "restack"
						? restackError(restacked.outcome)
						: restacked.outcome.kind === "failed"
							? submitError("readiness-recheck", restacked.outcome)
							: {
									code: "flow-minimal-submit-restack-still-required",
									message: "Graphite still requires a restack after restacking completed.",
								},
				remoteFallback: "none",
			});
		}
		transportPhases.complete("readiness-recheck");
		readyTransport = restacked;
	} else {
		readyTransport = preparation;
	}

	const submittedTransport = await readyTransport.submitPrimary(commandParams);
	if (submittedTransport.kind === "failed") {
		transportPhases.fail("submit");
		return await failureAfterMutation({
			context,
			before: before.value,
			plan,
			stage: "submit",
			error: submitError("submit", submittedTransport.outcome),
			remoteFallback: "possible",
		});
	}
	const submitted = submittedTransport.outcome;
	if (submitted.semanticFailureCause !== undefined) {
		transportPhases.fail("submit");
		return await failureAfterMutation({
			context,
			before: before.value,
			plan,
			stage: "submit",
			error: {
				code: "flow-minimal-submit-semantic-failure",
				message: "Graphite reported a semantic submit failure after the submit command completed.",
			},
			remoteFallback: "observed",
		});
	}
	transportPhases.complete("submit");

	const verified = await submittedTransport.verifyCurrentPr(commandParams);
	if (verified.kind !== "present") {
		transportPhases.fail("verification");
		return await failureAfterMutation({
			context,
			before: before.value,
			plan,
			stage: "verification",
			error: verificationError(verified),
			remoteFallback: "observed",
		});
	}
	const after = await context.repository.observeAffectedBranches(plan.affectedBranches);
	if (!after.ok) {
		transportPhases.fail("verification");
		return executionFailure(
			"verification",
			{
				code: "flow-minimal-submit-after-observation-failed",
				message: `Submit completed, but final local state could not be observed. ${after.error.message}`,
			},
			{ local: "possible", remote: "observed" },
			plan,
		);
	}
	if (after.value.source.branch !== plan.source.branch) {
		transportPhases.fail("verification");
		return executionFailure(
			"verification",
			{
				code: "flow-minimal-submit-branch-drift",
				message: `Current branch changed from ${plan.source.branch} to ${after.value.source.branch}.`,
			},
			mutationFromObservations(before.value, after.value, "observed"),
			plan,
		);
	}
	const dirtyError = validateClean(after.value);
	if (dirtyError !== undefined) {
		transportPhases.fail("verification");
		return executionFailure(
			"verification",
			dirtyError,
			mutationFromObservations(before.value, after.value, "observed"),
			plan,
		);
	}
	transportPhases.complete("verification");
	return {
		type: "submitted",
		stage: "verification",
		plan,
		source: after.value.source,
		mutation: mutationFromObservations(before.value, after.value, "observed"),
	};
}

function validateSource(
	actual: FlowMinimalSubmitSource,
	expected: FlowMinimalSubmitSource | undefined,
): FlowMinimalSubmitError | undefined {
	if (expected === undefined) return undefined;
	if (actual.branch !== expected.branch) {
		return {
			code: "flow-minimal-submit-branch-drift",
			message: `Current branch ${actual.branch} does not match expected source ${expected.branch}.`,
		};
	}
	if (actual.headSha !== expected.headSha) {
		return {
			code: "flow-minimal-submit-head-drift",
			message: `Current HEAD ${actual.headSha} does not match expected source ${expected.headSha}.`,
		};
	}
	return undefined;
}

function validateClean(
	inspection: Pick<MinimalSubmitRepositoryInspection, "dirtyPaths" | "isDirtyPathsTruncated">,
): FlowMinimalSubmitError | undefined {
	if (inspection.dirtyPaths.length === 0) return undefined;
	return {
		code: "flow-minimal-submit-dirty-worktree",
		message: "Minimal submit requires a clean worktree.",
		dirtyPaths: inspection.dirtyPaths.slice(0, FLOW_MINIMAL_SUBMIT_MAX_DIRTY_PATHS),
		isDirtyPathsTruncated: inspection.isDirtyPathsTruncated,
	};
}

function validateObservationBefore(
	observation: MinimalSubmitRepositoryObservation,
	expectedSource: FlowMinimalSubmitSource,
): FlowMinimalSubmitError | undefined {
	return validateSource(observation.source, expectedSource) ?? validateClean(observation);
}

function formatTopologyFailureCode(
	failure: GraphiteStackPathFailure,
): Extract<FlowMinimalSubmitErrorCode, `flow-minimal-submit-topology-${string}`> {
	switch (failure.type) {
		case "untracked_branch":
			return "flow-minimal-submit-topology-untracked-branch";
		case "provider_failure":
			return "flow-minimal-submit-topology-provider-failure";
		case "ancestor_cycle":
			return "flow-minimal-submit-topology-ancestor-cycle";
		case "ancestor_row_missing":
			return "flow-minimal-submit-topology-ancestor-row-missing";
		case "trunk_marker_problem":
			return "flow-minimal-submit-topology-trunk-marker-problem";
		case "path_inconsistent":
			return "flow-minimal-submit-topology-path-inconsistent";
	}
}

function formatTopologyFailure(failure: GraphiteStackPathFailure): string {
	switch (failure.type) {
		case "untracked_branch":
			return failure.message;
		case "provider_failure":
			return failure.failure.message;
		case "ancestor_cycle":
			return `Graphite ancestry contains a cycle at ${failure.branch}.`;
		case "ancestor_row_missing":
			return `Graphite ancestry is missing metadata for ${failure.branch}.`;
		case "trunk_marker_problem":
			return "Graphite trunk metadata is ambiguous or inconsistent.";
		case "path_inconsistent":
			return `Graphite path from ${failure.trunk} to ${failure.current} is inconsistent.`;
	}
}

function planningFailure(error: FlowMinimalSubmitError): FlowMinimalSubmitPlanResult {
	return { type: "failed", stage: "planning", error, mutation: noMutation() };
}

function executionFailure(
	stage: FlowMinimalSubmitStage,
	error: FlowMinimalSubmitError,
	mutation: FlowMinimalSubmitMutationEvidence = noMutation(),
	plan?: FlowMinimalSubmitPlan,
): FlowMinimalSubmitResult {
	return {
		type: "failed",
		stage,
		error,
		mutation,
		...(plan === undefined ? {} : { plan }),
	};
}

function noMutation(): FlowMinimalSubmitMutationEvidence {
	return { local: "none", remote: "none" };
}

function submitError(
	stage: "readiness" | "readiness-recheck" | "submit",
	result: Extract<SubmitPreflightResult | SubmitRunResult, { kind: "failed" }>,
): FlowMinimalSubmitError {
	return {
		code: `flow-minimal-submit-${stage}-failed`,
		message: conciseCommandFailure(`Graphite ${stage} failed.`, result.output),
	};
}

function restackError(
	result: Exclude<SubmitRestackResult, { kind: "success" }>,
): FlowMinimalSubmitError {
	if (result.kind === "conflict") {
		return {
			code: "flow-minimal-submit-restack-conflict",
			message: `Graphite restack stopped with conflicts${
				result.conflictedFiles.length === 0 ? "." : ` in ${result.conflictedFiles.join(", ")}.`
			}`,
		};
	}
	return {
		code: "flow-minimal-submit-restack-failed",
		message: conciseCommandFailure("Graphite restack failed.", result.output),
	};
}

function verificationError(
	result: Exclude<CurrentPrVerificationResult, { kind: "present" }>,
): FlowMinimalSubmitError {
	return {
		code:
			result.kind === "no_current_pr"
				? "flow-minimal-submit-verification-no_current_pr"
				: "flow-minimal-submit-verification-failed",
		message:
			result.kind === "no_current_pr"
				? "Submit completed, but no current pull request could be verified."
				: conciseCommandFailure(
						"Submit completed, but current-PR verification failed.",
						result.output,
					),
	};
}

function conciseCommandFailure(prefix: string, output: { stdout: string; stderr: string }): string {
	const detail = [output.stderr.trim(), output.stdout.trim()].find((value) => value !== "");
	if (detail === undefined) return prefix;
	return `${prefix} ${detail.slice(0, 500)}`;
}

async function failureAfterMutation(input: {
	context: FlowMinimalSubmitContext;
	before: MinimalSubmitRepositoryObservation;
	plan: FlowMinimalSubmitPlan;
	stage: FlowMinimalSubmitStage;
	error: FlowMinimalSubmitError;
	remoteFallback: "none" | "possible" | "observed";
}): Promise<FlowMinimalSubmitResult> {
	const after = await input.context.repository.observeAffectedBranches(input.plan.affectedBranches);
	if (!after.ok) {
		return executionFailure(
			input.stage,
			input.error,
			{ local: "possible", remote: input.remoteFallback },
			input.plan,
		);
	}
	const mutation = mutationFromObservations(input.before, after.value, input.remoteFallback);
	return executionFailure(
		input.stage,
		input.error,
		input.error.code === "flow-minimal-submit-restack-conflict" && mutation.local === "none"
			? { ...mutation, local: "possible" }
			: mutation,
		input.plan,
	);
}

function mutationFromObservations(
	before: MinimalSubmitRepositoryObservation,
	after: MinimalSubmitRepositoryObservation,
	remoteFallback: "none" | "possible" | "observed",
): FlowMinimalSubmitMutationEvidence {
	const localChanged =
		before.source.branch !== after.source.branch ||
		before.source.headSha !== after.source.headSha ||
		!recordsEqual(before.localTips, after.localTips) ||
		before.dirtyPaths.join("\0") !== after.dirtyPaths.join("\0");
	const remoteChanged = !recordsEqual(before.remoteTips, after.remoteTips);
	return {
		local: localChanged ? "observed" : "none",
		remote: remoteChanged ? "observed" : remoteFallback,
	};
}

function submitPlansEqual(left: FlowMinimalSubmitPlan, right: FlowMinimalSubmitPlan): boolean {
	return (
		left.source.branch === right.source.branch &&
		left.source.headSha === right.source.headSha &&
		left.trunkBranch === right.trunkBranch &&
		left.affectedBranches.length === right.affectedBranches.length &&
		left.affectedBranches.every((branch, index) => branch === right.affectedBranches[index])
	);
}

function recordsEqual(
	left: Readonly<Record<string, string | null>>,
	right: Readonly<Record<string, string | null>>,
): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

type MinimalTransportStage = Exclude<FlowMinimalSubmitStage, "planning">;

interface MinimalTransportPhaseController {
	readonly observe: (observation: SubmitTransportObservation) => void;
	readonly complete: (stage: MinimalTransportStage) => void;
	readonly fail: (stage: MinimalTransportStage) => void;
}

function createMinimalTransportPhaseController(input: {
	readonly onPhase?: (event: FlowMinimalSubmitPhaseEvent) => void;
}): MinimalTransportPhaseController {
	let activeStage: MinimalTransportStage | undefined;
	return {
		observe: (observation) => {
			if (observation.type === "stage-completed") return;
			if (activeStage !== undefined) emitPhase(input, activeStage, "completed");
			activeStage = observation.stage;
			emitPhase(input, observation.stage, "started");
		},
		complete: (stage) => {
			emitPhase(input, stage, "completed");
			activeStage = undefined;
		},
		fail: (stage) => {
			emitPhase(input, stage, "failed");
			activeStage = undefined;
		},
	};
}

function emitPhase(
	input: { readonly onPhase?: (event: FlowMinimalSubmitPhaseEvent) => void },
	stage: FlowMinimalSubmitStage,
	status: FlowMinimalSubmitPhaseEvent["status"],
): void {
	notifyObserver(input.onPhase, { stage, status });
}

function notifyObserver<Observation>(
	observer: ((observation: Observation) => void) | undefined,
	observation: Observation,
): void {
	try {
		observer?.(observation);
	} catch {
		// Caller observations are non-controlling; presentation failures cannot alter submission.
	}
}
