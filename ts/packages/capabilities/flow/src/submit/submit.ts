import { optionalEntry } from "@nseng-ai/foundation/primitives";
import type { GitGateway } from "@nseng-ai/foundation/git";
import type { ModelSelection } from "@nseng-ai/foundation/model-slug";

import { withCommandOperations } from "../phase-stream/matrix-progress-core.ts";
import type {
	FlowPrDescriptionDescriptorSource,
	GithubPrGateway,
	TextGenerator,
	TimeServices,
} from "./index.ts";
import type { SubmitPrLink } from "./gt-output.ts";
import type {
	CurrentPrVerificationResult,
	SubmitCommandOutput,
	SubmitCommandParams,
	SubmitCommandResult,
	SubmitGateway,
	SubmitOutputListener,
	SubmitRunResult,
} from "./submit-contracts.ts";
import {
	deterministicSubmitCommandFailure,
	normalizedSubmitFailureExitCode,
	postSubmitFailureTranscript,
	submitCommandFailureTranscript,
	submitFailureResult,
	submitTextFailureTranscript,
} from "./submit-failure-result.ts";
import {
	submitMatrixRowsFromTopology,
	type SubmitMatrixProgressSink,
} from "./submit-matrix-progress.ts";
import {
	formatSubmitPreflightFailureCause,
	type SubmitPreflightFailureCause,
} from "./submit-failure-catalog.ts";
import {
	formatPostSubmitFailureOutput,
	formatItemCount,
	formatSubmitFailureOutput,
	formatSubmitSuccessFallbackText,
	formatSubmitSuccessText,
} from "./submit-format.ts";
import type { SubmitStackInspectionGateway } from "./submit-stack-inspection.ts";
import { buildSubmitPlan, type SubmitPlan } from "./submit-plan.ts";
import {
	formatPrDescriptionFailureDiagnostics,
	formatPrDescriptionFailureText,
	generateSubmitPrDescriptions,
	type SubmitPrDescriptionProgressEvent,
} from "./submit-pr-descriptions.ts";
import type { SubmitProgressListeners } from "./submit-progress-listeners.ts";
import {
	formatStackUpdateCommandDisplay,
	formatSubmitCommandDisplays,
} from "./submit-command-spec.ts";
import { mergePrLinks, partitionPrLinksByExisting, prNumberFromLink } from "./submit-pr-link.ts";
import type { NsProgressPhaseEvent } from "@nseng-ai/sdk";
import type { SubmitProgress } from "./submit-progress.ts";
import type { SubmitTransportReady } from "./submit-transport.ts";
import { prepareOrdinarySubmitTransport } from "./submit-transport-preparation.ts";

export { RealSubmitGateway } from "./submit-gateway.ts";

export type {
	CurrentPrVerificationFailureCause,
	RemoteSyncDiagnostics,
	SubmitPreflightFailureCause,
	SubmitSemanticFailureCause,
} from "./submit-failure-catalog.ts";

const CURRENT_PR_COMMAND_DISPLAY = "gh pr view --json number,url";

export type {
	CurrentPrVerificationResult,
	SubmitCommandOutput,
	SubmitCommandParams,
	SubmitCommandResult,
	SubmitFailurePresentation,
	SubmitFailureTranscript,
	SubmitFailureTranscriptCommand,
	SubmitGateway,
	SubmitOutputListener,
	SubmitOutputStream,
	SubmitPreflightResult,
	SubmitRestackResult,
	SubmitRunResult,
} from "./submit-contracts.ts";

export interface SubmitRestackConfirmationPrompt {
	title: string;
	message: string;
}

export type SubmitRestackConfirmation = (
	prompt: SubmitRestackConfirmationPrompt,
) => Promise<boolean> | boolean;

export interface SubmitPrDescriptionOptions {
	githubPr: GithubPrGateway;
	textGenerator: TextGenerator;
	git: GitGateway;
	descriptorSource: FlowPrDescriptionDescriptorSource;
	env: Record<string, string | undefined>;
	modelSelection: ModelSelection;
	time?: TimeServices;
}

export interface RunSubmitCommandOptions {
	cwd: string;
	gateway: SubmitGateway;
	metadataGateway: SubmitStackInspectionGateway;
	restack: boolean;
	force: boolean;
	shouldForwardCommandOutput?: boolean;
	onOutput?: SubmitOutputListener;
	/** Typed phase and matrix progress for a presentation driver. Separate channel from raw `onOutput`. */
	progress: SubmitProgress;
	confirmRestack?: SubmitRestackConfirmation;
	prDescription: SubmitPrDescriptionOptions;
	/**
	 * Widen the post-submit metadata batch from newly created PRs to every
	 * resolved PR link in the submitted scope. The caller owns authorization for
	 * this destructive replacement of existing PR titles and bodies.
	 */
	shouldReplaceAllPrMetadata?: boolean;
}

export async function runSubmitCommand(
	options: RunSubmitCommandOptions,
): Promise<SubmitCommandResult> {
	const { submitCommandDisplay, submitDryRunCommandDisplay } = formatSubmitCommandDisplays({
		shouldForce: options.force,
	});
	const stackUpdateCommandDisplay = formatStackUpdateCommandDisplay({ shouldForce: options.force });
	const commandParams = submitCommandParams(options);
	const readiness = await prepareOrdinarySubmitTransport({
		command: options,
		params: commandParams,
		submitCommandDisplay,
		submitDryRunCommandDisplay,
	});
	if (readiness.kind === "failure") return readiness.failure;

	emitPhase(options, { type: "phase-started", phaseKey: "inventory" });
	const planned = await buildSubmitPlan({
		cwd: options.cwd,
		gateway: options.metadataGateway,
		onProgress: (message) =>
			emitPhase(options, { type: "phase-progress", phaseKey: "inventory", label: message }),
	});
	if (planned.kind === "failed") {
		emitPhase(options, { type: "phase-failed", phaseKey: "inventory", detail: "inventory failed" });
		return failure(1, planned.error, {
			failurePresentation: "deterministic",
			rawFailureTranscript: submitTextFailureTranscript("submit inventory", planned.error, []),
		});
	}
	const plan = planned.plan;
	options.progress.matrix?.setRows(submitMatrixRowsFromTopology(plan));
	emitPhase(options, {
		type: "phase-done",
		phaseKey: "inventory",
		detail: `${plan.branches.length} ${plan.branches.length === 1 ? "branch" : "branches"} in submit stack`,
	});
	return executeSubmitPlan(plan, readiness.transport);

	async function executeSubmitPlan(
		planToExecute: SubmitPlan,
		readyTransport: SubmitTransportReady,
	): Promise<SubmitCommandResult> {
		emitPhase(options, {
			type: "phase-started",
			phaseKey: "submit",
			label: submitCommandDisplay,
		});
		const submittedTransport = await readyTransport.submitPrimary(
			submitStreamingCommandParams(options),
		);
		if (submittedTransport.kind === "failed") {
			emitPhase(options, {
				type: "phase-failed",
				phaseKey: "submit",
				detail: "submit failed",
			});
			const knownFailure = knownSubmitFailureFor({
				cause: submittedTransport.outcome.cause,
				output: submittedTransport.outcome.output,
				phase: "submit preflight",
				transcriptCommandDisplay: submitCommandDisplay,
			});
			if (knownFailure !== undefined) return knownFailure;
			return failure(
				normalizedSubmitFailureExitCode(submittedTransport.outcome.output),
				formatSubmitFailureOutput(submittedTransport.outcome.output, submitCommandDisplay),
				{
					failurePresentation: "unknown",
					rawFailureTranscript: submitCommandFailureTranscript({
						phase: "submit",
						commandDisplay: submitCommandDisplay,
						output: submittedTransport.outcome.output,
					}),
				},
			);
		}

		let combinedSubmitOutcome = submittedTransport.outcome;
		if (combinedSubmitOutcome.semanticFailureCause !== undefined) {
			emitPhase(options, { type: "phase-failed", phaseKey: "submit", detail: "submit failed" });
			emitPhase(options, {
				type: "phase-started",
				phaseKey: "verification",
				label: "checking current PR",
			});
			const currentPr = await submittedTransport.verifyCurrentPr(commandParams);
			emitPhase(options, {
				type: "phase-failed",
				phaseKey: "verification",
				detail: "verification failed",
			});
			const stderr = formatPostSubmitFailureOutput({
				submitted: combinedSubmitOutcome,
				currentPr,
				submitCommandDisplay,
			});
			return failure(1, stderr, {
				failurePresentation: "unknown",
				rawFailureTranscript: postSubmitFailureTranscript({
					summary: stderr,
					submitted: combinedSubmitOutcome,
					currentPr,
					submitCommandDisplay,
					currentPrCommandDisplay: CURRENT_PR_COMMAND_DISPLAY,
				}),
			});
		}
		if (planToExecute.hasUpstackBranches) {
			emitPhase(options, {
				type: "phase-progress",
				phaseKey: "submit",
				label: stackUpdateCommandDisplay,
			});

			const stackUpdateStep = await runSubmitPhaseStep({
				options,
				phaseLabel: "stack update",
				commandDisplay: stackUpdateCommandDisplay,
				run: (gateway, params) => gateway.updateStackPrs(params),
			});
			if (stackUpdateStep.kind === "failure") return stackUpdateStep.failure;

			combinedSubmitOutcome = combineSubmitOutcomes(combinedSubmitOutcome, stackUpdateStep.result);
		}
		emitPhase(options, { type: "phase-done", phaseKey: "submit", detail: "stack submitted" });
		emitPhase(options, {
			type: "phase-started",
			phaseKey: "verification",
			label: "checking current PR",
		});
		const currentPr = await submittedTransport.verifyCurrentPr(commandParams);
		if (
			combinedSubmitOutcome.semanticFailureCause !== undefined ||
			shouldFailPostSubmitVerification(combinedSubmitOutcome, currentPr)
		) {
			emitPhase(options, {
				type: "phase-failed",
				phaseKey: "verification",
				detail: "verification failed",
			});
			const stderr = formatPostSubmitFailureOutput({
				submitted: combinedSubmitOutcome,
				currentPr,
				submitCommandDisplay,
			});
			return failure(1, stderr, {
				// Post-submit verification failures keep their raw command output in the
				// message, so route them through the model interpreter rather than showing
				// the transcript verbatim.
				failurePresentation: "unknown",
				rawFailureTranscript: postSubmitFailureTranscript({
					summary: stderr,
					submitted: combinedSubmitOutcome,
					currentPr,
					submitCommandDisplay,
					currentPrCommandDisplay: CURRENT_PR_COMMAND_DISPLAY,
				}),
			});
		}

		const prLinks =
			currentPr.kind === "present"
				? mergePrLinks(combinedSubmitOutcome.prLinks, currentPr.prLinks)
				: mergePrLinks(combinedSubmitOutcome.prLinks, []);
		options.progress.matrix?.applyPrLinks(prLinks);
		emitPhase(options, {
			type: "phase-done",
			phaseKey: "verification",
			detail:
				currentPr.kind === "present"
					? formatVerifiedCurrentPrText(currentPr.prLinks)
					: "current PR not detected",
		});
		const partitionedPrLinks = partitionPrLinksByExisting(prLinks, planToExecute.existingPrLinks);
		const descriptionPrLinks =
			options.shouldReplaceAllPrMetadata === true ? prLinks : partitionedPrLinks.newPrLinks;
		emitSubmitPhase(
			options,
			{
				type: "phase-started",
				phaseKey: "descriptions",
				label: formatDescriptionPhaseStart(descriptionPrLinks.length),
			},
			(matrix) => {
				if (descriptionPrLinks.length === 0) {
					matrix.setAllCells("description", { state: "skipped" });
				}
			},
		);
		options.progress.matrix?.setActiveOperations([]);
		const descriptionResult = await generateSubmitPrDescriptions({
			cwd: options.cwd,
			prDescription: options.prDescription,
			prLinks: descriptionPrLinks,
			progress: submitPhaseProgressListeners<SubmitPrDescriptionProgressEvent>(
				options,
				"descriptions",
				(event) => {
					options.progress.matrix?.setCellByPrNumber(event.prNumber, "description", {
						state: event.state,
						...optionalEntry("text", event.message),
					});
				},
			),
		});
		options.progress.matrix?.setActiveOperations([]);
		if (!descriptionResult.ok) {
			emitPhase(options, {
				type: "phase-failed",
				phaseKey: "descriptions",
				detail: "PR description generation failed",
			});
			const stderr = formatPrDescriptionFailureText(prLinks, descriptionResult);
			const details = formatPrDescriptionFailureDiagnostics(descriptionResult.failures);
			return failure(1, stderr, {
				failurePresentation: "deterministic",
				rawFailureTranscript: submitTextFailureTranscript("PR description", stderr, details),
			});
		}

		options.progress.matrix?.setPendingCells("description", { state: "skipped" });
		emitPhase(options, {
			type: "phase-done",
			phaseKey: "descriptions",
			detail: "descriptions ready",
		});
		const successText =
			prLinks.length > 0
				? formatSubmitSuccessText(prLinks, descriptionResult)
				: formatSubmitSuccessFallbackText(
						combinedSubmitOutcome.output.stdout,
						combinedSubmitOutcome.output.stderr,
					);
		return success(successText);
	}
}

function formatDescriptionPhaseStart(prCount: number): string {
	if (prCount === 0) return "checking PR descriptions; no PR descriptions selected";
	return `preparing complete metadata for ${formatItemCount(prCount, "PR", "PRs")}`;
}

function formatVerifiedCurrentPrText(prLinks: readonly SubmitPrLink[]): string {
	const prNumber = prLinks.map(prNumberFromLink).find((number) => number !== undefined);
	if (prNumber === undefined) return "current PR verified";
	return `current PR verified (#${prNumber})`;
}

function knownSubmitFailureFor(input: {
	cause: SubmitPreflightFailureCause | undefined;
	output: SubmitCommandOutput;
	phase: string;
	transcriptCommandDisplay: string;
}): SubmitCommandResult | undefined {
	if (input.cause === undefined) return undefined;

	return deterministicSubmitCommandFailure({
		phase: input.phase,
		commandDisplay: input.transcriptCommandDisplay,
		output: input.output,
		stderr: formatPreflightCauseOutput({
			cause: input.cause,
			output: input.output,
		}),
	});
}

function formatPreflightCauseOutput(input: {
	cause: SubmitPreflightFailureCause;
	output: SubmitCommandOutput;
}): string {
	return formatSubmitPreflightFailureCause(input.cause, input.output);
}

type SuccessfulSubmitRunResult = Extract<SubmitRunResult, { kind: "success" }>;

type SubmitPhaseStepResult =
	| { kind: "success"; result: SuccessfulSubmitRunResult }
	| { kind: "failure"; failure: SubmitCommandResult };

function combineSubmitOutcomes(
	base: SuccessfulSubmitRunResult,
	update: SuccessfulSubmitRunResult,
): SuccessfulSubmitRunResult {
	return {
		...base,
		prLinks: mergePrLinks(base.prLinks, update.prLinks),
		...(update.semanticFailureCause === undefined
			? {}
			: { semanticFailureCause: update.semanticFailureCause }),
	};
}

async function runSubmitPhaseStep(input: {
	options: Pick<RunSubmitCommandOptions, "cwd" | "force" | "gateway" | "onOutput" | "progress">;
	phaseLabel: string;
	commandDisplay: string;
	knownFailurePhase?: string;
	run: (gateway: SubmitGateway, params: SubmitCommandParams) => Promise<SubmitRunResult>;
}): Promise<SubmitPhaseStepResult> {
	const result = await withCommandOperations(
		input.options.progress.matrix,
		[input.commandDisplay],
		() => input.run(input.options.gateway, submitStreamingCommandParams(input.options)),
	);
	if (result.kind === "success") return { kind: "success", result };

	emitPhase(input.options, {
		type: "phase-failed",
		phaseKey: "submit",
		detail: `${input.phaseLabel} failed`,
	});
	if (input.knownFailurePhase !== undefined) {
		const knownFailure = knownSubmitFailureFor({
			cause: result.cause,
			output: result.output,
			phase: input.knownFailurePhase,
			transcriptCommandDisplay: input.commandDisplay,
		});
		if (knownFailure !== undefined) return { kind: "failure", failure: knownFailure };
	}

	return {
		kind: "failure",
		failure: failure(
			normalizedSubmitFailureExitCode(result.output),
			formatSubmitFailureOutput(result.output, input.commandDisplay),
			{
				failurePresentation: "unknown",
				rawFailureTranscript: submitCommandFailureTranscript({
					phase: input.phaseLabel,
					commandDisplay: input.commandDisplay,
					output: result.output,
				}),
			},
		),
	};
}

function submitCommandParams(
	options: Pick<
		RunSubmitCommandOptions,
		"cwd" | "force" | "shouldForwardCommandOutput" | "onOutput"
	>,
): SubmitCommandParams {
	return {
		cwd: options.cwd,
		...(options.force ? { force: true } : {}),
		...optionalOutputListenerParam(
			options.shouldForwardCommandOutput === false ? undefined : options.onOutput,
		),
	};
}

// The `gt submit` phase always streams its raw output live so the user can watch
// Graphite create/update PRs in real time, independent of --verbose. The other
// phases (preflight dry-run, restack, verification) remain gated by --verbose via
// submitCommandParams to keep default output concise.
function submitStreamingCommandParams(
	options: Pick<RunSubmitCommandOptions, "cwd" | "force" | "onOutput">,
): SubmitCommandParams {
	return {
		cwd: options.cwd,
		...(options.force ? { force: true } : {}),
		...optionalOutputListenerParam(options.onOutput),
	};
}

function optionalOutputListenerParam(
	onOutput: SubmitOutputListener | undefined,
): Pick<SubmitCommandParams, "onOutput"> {
	return onOutput === undefined ? {} : { onOutput };
}

function emitPhase(
	options: Pick<RunSubmitCommandOptions, "progress">,
	event: NsProgressPhaseEvent,
): void {
	options.progress.phase(event);
}

function emitSubmitPhase(
	options: Pick<RunSubmitCommandOptions, "progress">,
	event: NsProgressPhaseEvent,
	updateMatrix: (matrix: SubmitMatrixProgressSink) => void,
): void {
	emitPhase(options, event);
	if (options.progress.matrix !== undefined) updateMatrix(options.progress.matrix);
}

function submitPhaseProgressListeners<ItemProgressEvent>(
	options: Pick<RunSubmitCommandOptions, "progress">,
	phaseKey: string,
	onItemProgress: (event: ItemProgressEvent) => void,
): SubmitProgressListeners<ItemProgressEvent> {
	return {
		onProgress: (message) =>
			emitPhase(options, { type: "phase-progress", phaseKey, label: message }),
		onActiveOperations: (operations) => options.progress.matrix?.setActiveOperations(operations),
		onItemProgress,
	};
}

function shouldFailPostSubmitVerification(
	submitted: Extract<SubmitRunResult, { kind: "success" }>,
	currentPr: CurrentPrVerificationResult,
): boolean {
	if (currentPr.kind === "present") return false;
	if (currentPr.kind === "no_current_pr" && submitted.prLinks.length > 0) return false;
	return true;
}

function success(stdout: string): SubmitCommandResult {
	return {
		exitCode: 0,
		stdout: stdout.endsWith("\n") ? stdout : `${stdout}\n`,
		stderr: "",
	};
}

function failure(
	exitCode: number,
	stderr: string,
	options?: Parameters<typeof submitFailureResult>[2],
): SubmitCommandResult {
	return submitFailureResult(exitCode, stderr, options);
}
