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

export const DISPATCH_SOURCE_PUBLICATION_MAX_DIRTY_PATHS = 50;

export type DispatchSourcePublicationStage =
	| "planning"
	| "readiness"
	| "restack"
	| "readiness-recheck"
	| "submit"
	| "verification";

export type DispatchSourcePublicationMutationState = "none" | "observed" | "possible";

export interface DispatchPublicationEngineMutationEvidence {
	readonly local: DispatchSourcePublicationMutationState;
	readonly remote: DispatchSourcePublicationMutationState;
}

export interface DispatchSourcePublicationSource {
	readonly branch: string;
	readonly headSha: string;
}

export interface DispatchSourcePublicationPlan {
	readonly source: DispatchSourcePublicationSource;
	readonly trunkBranch: string;
	/** Current branch followed by its non-trunk downstack ancestors, nearest first. */
	readonly affectedBranches: readonly string[];
}

export type DispatchSourcePublicationErrorCode =
	| "dispatch-source-publication-after-observation-failed"
	| "dispatch-source-publication-branch-drift"
	| "dispatch-source-publication-branch-read-failed"
	| "dispatch-source-publication-dirty-worktree"
	| "dispatch-source-publication-head-drift"
	| "dispatch-source-publication-head-read-failed"
	| "dispatch-source-publication-not-graphite-tracked"
	| "dispatch-source-publication-observation-failed"
	| "dispatch-source-publication-observation-incomplete"
	| "dispatch-source-publication-observation-parse-failed"
	| "dispatch-source-publication-plan-drift"
	| "dispatch-source-publication-readiness-failed"
	| "dispatch-source-publication-readiness-recheck-failed"
	| "dispatch-source-publication-remote-observation-failed"
	| "dispatch-source-publication-remote-observation-incomplete"
	| "dispatch-source-publication-remote-observation-parse-failed"
	| "dispatch-source-publication-restack-conflict"
	| "dispatch-source-publication-restack-failed"
	| "dispatch-source-publication-restack-required"
	| "dispatch-source-publication-restack-still-required"
	| "dispatch-source-publication-semantic-failure"
	| "dispatch-source-publication-status-read-failed"
	| "dispatch-source-publication-submit-failed"
	| "dispatch-source-publication-topology-ancestor-cycle"
	| "dispatch-source-publication-topology-ancestor-row-missing"
	| "dispatch-source-publication-topology-path-inconsistent"
	| "dispatch-source-publication-topology-provider-failure"
	| "dispatch-source-publication-topology-trunk-marker-problem"
	| "dispatch-source-publication-topology-untracked-branch"
	| "dispatch-source-publication-topology-current-mismatch"
	| "dispatch-source-publication-verification-failed"
	| "dispatch-source-publication-verification-no_current_pr";

export interface DispatchSourcePublicationError {
	readonly code: DispatchSourcePublicationErrorCode;
	readonly message: string;
	readonly displayCommand?: string;
	readonly dirtyPaths?: readonly string[];
	readonly isDirtyPathsTruncated?: boolean;
}

export type DispatchSourcePublicationPlanResult =
	| { readonly type: "tracked"; readonly plan: DispatchSourcePublicationPlan }
	| {
			readonly type: "not-graphite-tracked";
			readonly source: DispatchSourcePublicationSource;
			readonly message: string;
	  }
	| {
			readonly type: "failed";
			readonly stage: "planning";
			readonly error: DispatchSourcePublicationError;
			readonly mutation: DispatchPublicationEngineMutationEvidence;
	  };

export interface DispatchSourcePublicationPhaseEvent {
	readonly stage: DispatchSourcePublicationStage;
	readonly status: "started" | "completed" | "failed";
}

export interface DispatchSourcePublicationOutputEvent {
	readonly stream: "stdout" | "stderr";
	readonly text: string;
}

export type DispatchSourcePublicationResult =
	| {
			readonly type: "submitted";
			readonly stage: "verification";
			readonly plan: DispatchSourcePublicationPlan;
			readonly source: DispatchSourcePublicationSource;
			readonly mutation: DispatchPublicationEngineMutationEvidence;
	  }
	| {
			readonly type: "failed";
			readonly stage: DispatchSourcePublicationStage;
			readonly error: DispatchSourcePublicationError;
			readonly mutation: DispatchPublicationEngineMutationEvidence;
			readonly plan?: DispatchSourcePublicationPlan;
	  };

interface DispatchSourcePublicationExecutionOptions {
	readonly restack?: boolean;
	readonly force?: boolean;
	/** Non-controlling progress observer; callback failures do not alter submission. */
	readonly onPhase?: (event: DispatchSourcePublicationPhaseEvent) => void;
	/** Non-controlling command-output observer; callback failures do not alter submission. */
	readonly onOutput?: (event: DispatchSourcePublicationOutputEvent) => void;
}

export type DispatchSourcePublicationInput = DispatchSourcePublicationExecutionOptions &
	(
		| {
				readonly type: "planned";
				/** The complete caller-authorized plan; its source is the sole expected source. */
				readonly expectedPlan: DispatchSourcePublicationPlan;
				readonly expectedSource?: never;
		  }
		| {
				readonly type: "unplanned";
				readonly expectedSource: DispatchSourcePublicationSource;
				readonly expectedPlan?: never;
		  }
	);

export interface DispatchSourcePublicationClient {
	planCurrentBranch(input?: {
		readonly expectedSource?: DispatchSourcePublicationSource;
	}): Promise<DispatchSourcePublicationPlanResult>;
	submitCurrentBranch(
		input: DispatchSourcePublicationInput,
	): Promise<DispatchSourcePublicationResult>;
}

export interface DispatchSourcePublicationGatewaySuccess<T> {
	readonly ok: true;
	readonly value: T;
}

export interface DispatchSourcePublicationGatewayFailure {
	readonly ok: false;
	readonly error: DispatchSourcePublicationError;
}

export type DispatchSourcePublicationGatewayResult<T> =
	| DispatchSourcePublicationGatewaySuccess<T>
	| DispatchSourcePublicationGatewayFailure;

export interface SourcePublicationRepositoryInspection {
	readonly source: DispatchSourcePublicationSource;
	readonly dirtyPaths: readonly string[];
	readonly isDirtyPathsTruncated: boolean;
}

export interface SourcePublicationRepositoryObservation extends SourcePublicationRepositoryInspection {
	readonly localTips: Readonly<Record<string, string>>;
	readonly remoteTips: Readonly<Record<string, string | null>>;
}

export interface SourcePublicationRepositoryGateway {
	inspectCurrent(): Promise<
		DispatchSourcePublicationGatewayResult<SourcePublicationRepositoryInspection>
	>;
	observeAffectedBranches(
		branches: readonly string[],
	): Promise<DispatchSourcePublicationGatewayResult<SourcePublicationRepositoryObservation>>;
}

export interface DispatchSourcePublicationContext {
	readonly repository: SourcePublicationRepositoryGateway;
	readonly graphite: Pick<GraphiteStackGateway, "stackForBranch">;
	readonly submit: SubmitTransportGateway;
	readonly cwd: string;
}

/** Package-private construction seam for fake-driven tests and the real API factory. */
export function createDispatchSourcePublicationClientFromGateways(
	context: DispatchSourcePublicationContext,
): DispatchSourcePublicationClient {
	return {
		planCurrentBranch: async (input = {}) => await planCurrentBranch(context, input.expectedSource),
		submitCurrentBranch: async (input) => await submitCurrentBranch(context, input),
	};
}

async function planCurrentBranch(
	context: DispatchSourcePublicationContext,
	expectedSource: DispatchSourcePublicationSource | undefined,
): Promise<DispatchSourcePublicationPlanResult> {
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
			code: "dispatch-source-publication-topology-current-mismatch",
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
	context: DispatchSourcePublicationContext,
	input: DispatchSourcePublicationInput,
): Promise<DispatchSourcePublicationResult> {
	const expectedSource =
		input.type === "planned" ? input.expectedPlan.source : input.expectedSource;
	emitPhase(input, "planning", "started");
	const planned = await planCurrentBranch(context, expectedSource);
	if (planned.type !== "tracked") {
		emitPhase(input, "planning", "failed");
		if (planned.type === "failed") return planned;
		return executionFailure("planning", {
			code: "dispatch-source-publication-not-graphite-tracked",
			message: planned.message,
		});
	}
	const plan = planned.plan;
	if (input.type === "planned" && !submitPlansEqual(plan, input.expectedPlan)) {
		emitPhase(input, "planning", "failed");
		return executionFailure(
			"planning",
			{
				code: "dispatch-source-publication-plan-drift",
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

	const transportPhases = createPublicationTransportPhaseController(input);
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
					code: "dispatch-source-publication-restack-required",
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
									code: "dispatch-source-publication-restack-still-required",
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
				code: "dispatch-source-publication-semantic-failure",
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
				code: "dispatch-source-publication-after-observation-failed",
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
				code: "dispatch-source-publication-branch-drift",
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
	actual: DispatchSourcePublicationSource,
	expected: DispatchSourcePublicationSource | undefined,
): DispatchSourcePublicationError | undefined {
	if (expected === undefined) return undefined;
	if (actual.branch !== expected.branch) {
		return {
			code: "dispatch-source-publication-branch-drift",
			message: `Current branch ${actual.branch} does not match expected source ${expected.branch}.`,
		};
	}
	if (actual.headSha !== expected.headSha) {
		return {
			code: "dispatch-source-publication-head-drift",
			message: `Current HEAD ${actual.headSha} does not match expected source ${expected.headSha}.`,
		};
	}
	return undefined;
}

function validateClean(
	inspection: Pick<SourcePublicationRepositoryInspection, "dirtyPaths" | "isDirtyPathsTruncated">,
): DispatchSourcePublicationError | undefined {
	if (inspection.dirtyPaths.length === 0) return undefined;
	return {
		code: "dispatch-source-publication-dirty-worktree",
		message: "Source publication requires a clean worktree.",
		dirtyPaths: inspection.dirtyPaths.slice(0, DISPATCH_SOURCE_PUBLICATION_MAX_DIRTY_PATHS),
		isDirtyPathsTruncated: inspection.isDirtyPathsTruncated,
	};
}

function validateObservationBefore(
	observation: SourcePublicationRepositoryObservation,
	expectedSource: DispatchSourcePublicationSource,
): DispatchSourcePublicationError | undefined {
	return validateSource(observation.source, expectedSource) ?? validateClean(observation);
}

function formatTopologyFailureCode(
	failure: GraphiteStackPathFailure,
): Extract<DispatchSourcePublicationErrorCode, `dispatch-source-publication-topology-${string}`> {
	switch (failure.type) {
		case "untracked_branch":
			return "dispatch-source-publication-topology-untracked-branch";
		case "provider_failure":
			return "dispatch-source-publication-topology-provider-failure";
		case "ancestor_cycle":
			return "dispatch-source-publication-topology-ancestor-cycle";
		case "ancestor_row_missing":
			return "dispatch-source-publication-topology-ancestor-row-missing";
		case "trunk_marker_problem":
			return "dispatch-source-publication-topology-trunk-marker-problem";
		case "path_inconsistent":
			return "dispatch-source-publication-topology-path-inconsistent";
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

function planningFailure(
	error: DispatchSourcePublicationError,
): DispatchSourcePublicationPlanResult {
	return { type: "failed", stage: "planning", error, mutation: noMutation() };
}

function executionFailure(
	stage: DispatchSourcePublicationStage,
	error: DispatchSourcePublicationError,
	mutation: DispatchPublicationEngineMutationEvidence = noMutation(),
	plan?: DispatchSourcePublicationPlan,
): DispatchSourcePublicationResult {
	return {
		type: "failed",
		stage,
		error,
		mutation,
		...(plan === undefined ? {} : { plan }),
	};
}

function noMutation(): DispatchPublicationEngineMutationEvidence {
	return { local: "none", remote: "none" };
}

function submitError(
	stage: "readiness" | "readiness-recheck" | "submit",
	result: Extract<SubmitPreflightResult | SubmitRunResult, { kind: "failed" }>,
): DispatchSourcePublicationError {
	return {
		code: `dispatch-source-publication-${stage}-failed`,
		message: conciseCommandFailure(`Graphite ${stage} failed.`, result.output),
	};
}

function restackError(
	result: Exclude<SubmitRestackResult, { kind: "success" }>,
): DispatchSourcePublicationError {
	if (result.kind === "conflict") {
		return {
			code: "dispatch-source-publication-restack-conflict",
			message: `Graphite restack stopped with conflicts${
				result.conflictedFiles.length === 0 ? "." : ` in ${result.conflictedFiles.join(", ")}.`
			}`,
		};
	}
	return {
		code: "dispatch-source-publication-restack-failed",
		message: conciseCommandFailure("Graphite restack failed.", result.output),
	};
}

function verificationError(
	result: Exclude<CurrentPrVerificationResult, { kind: "present" }>,
): DispatchSourcePublicationError {
	return {
		code:
			result.kind === "no_current_pr"
				? "dispatch-source-publication-verification-no_current_pr"
				: "dispatch-source-publication-verification-failed",
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
	context: DispatchSourcePublicationContext;
	before: SourcePublicationRepositoryObservation;
	plan: DispatchSourcePublicationPlan;
	stage: DispatchSourcePublicationStage;
	error: DispatchSourcePublicationError;
	remoteFallback: "none" | "possible" | "observed";
}): Promise<DispatchSourcePublicationResult> {
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
		input.error.code === "dispatch-source-publication-restack-conflict" && mutation.local === "none"
			? { ...mutation, local: "possible" }
			: mutation,
		input.plan,
	);
}

function mutationFromObservations(
	before: SourcePublicationRepositoryObservation,
	after: SourcePublicationRepositoryObservation,
	remoteFallback: "none" | "possible" | "observed",
): DispatchPublicationEngineMutationEvidence {
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

function submitPlansEqual(
	left: DispatchSourcePublicationPlan,
	right: DispatchSourcePublicationPlan,
): boolean {
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

type PublicationTransportStage = Exclude<DispatchSourcePublicationStage, "planning">;

interface PublicationTransportPhaseController {
	readonly observe: (observation: SubmitTransportObservation) => void;
	readonly complete: (stage: PublicationTransportStage) => void;
	readonly fail: (stage: PublicationTransportStage) => void;
}

function createPublicationTransportPhaseController(input: {
	readonly onPhase?: (event: DispatchSourcePublicationPhaseEvent) => void;
}): PublicationTransportPhaseController {
	let activeStage: PublicationTransportStage | undefined;
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
	input: { readonly onPhase?: (event: DispatchSourcePublicationPhaseEvent) => void },
	stage: DispatchSourcePublicationStage,
	status: DispatchSourcePublicationPhaseEvent["status"],
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
