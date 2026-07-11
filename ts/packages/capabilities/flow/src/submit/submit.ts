import {
	type ExecOutputListener,
	type ExecOutputStream,
	type ExecResult,
} from "@nseng-ai/foundation/command";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import type { GitGateway } from "@nseng-ai/capability-kit/git";
import { formatErrorInfoDiagnosticLines } from "@nseng-ai/capability-kit/gateway-result";

import { withCommandOperations } from "../phase-stream/matrix-progress-core.ts";
import type {
	GithubPrGateway,
	PrewrittenPrMetadata,
	TextGenerator,
	TimeServices,
} from "./index.ts";
import type { SubmitPrLink } from "./gt-output.ts";
import {
	compactSubmitMetadataCellText,
	type SubmitMatrixProgressSink,
} from "./submit-matrix-progress.ts";
import {
	formatSubmitPreflightFailureCause,
	type CurrentPrVerificationFailureCause,
	type SubmitPreflightFailureCause,
	type SubmitSemanticFailureCause,
} from "./submit-failure-catalog.ts";
import {
	formatPostSubmitFailureOutput,
	formatPreflightFailureOutput,
	formatPrewrittenMetadataAdvisory,
	formatPrewriteFailureOutput,
	formatReadinessRecheckFailureOutput,
	formatRestackConfirmationPrompt,
	formatRestackConflictOutput,
	formatRestackDeclinedOutput,
	formatRestackFailureOutput,
	formatItemCount,
	formatRestackRequiredOutput,
	formatSubmitFailureOutput,
	formatSubmitSuccessFallbackText,
	formatSubmitSuccessText,
} from "./submit-format.ts";
import {
	prepareSubmitPrMetadata,
	type SubmitBranchMetadataProgressEvent,
	type SubmitMetadataGateway,
} from "./submit-pr-metadata-prewrite.ts";
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
import { prNumberFromLink } from "./submit-pr-link.ts";
import type { NsProgressPhaseEvent, NsProgressPhaseListener } from "@nseng-ai/kernel/sdk";

export { RealSubmitGateway } from "./submit-gateway.ts";

export type {
	CurrentPrVerificationFailureCause,
	RemoteSyncDiagnostics,
	SubmitPreflightFailureCause,
	SubmitSemanticFailureCause,
} from "./submit-failure-catalog.ts";

const RESTACK_COMMAND_DISPLAY = "gt restack --downstack --no-interactive";
const CURRENT_PR_COMMAND_DISPLAY = "gt branch info --no-interactive";

export type SubmitCommandOutput = ExecResult;

export type SubmitOutputStream = ExecOutputStream;
export type SubmitOutputListener = ExecOutputListener;

export interface SubmitRestackConfirmationPrompt {
	title: string;
	message: string;
}

export type SubmitRestackConfirmation = (
	prompt: SubmitRestackConfirmationPrompt,
) => Promise<boolean> | boolean;

export interface SubmitCommandParams {
	cwd: string;
	onOutput?: SubmitOutputListener;
	force?: boolean;
}

export type SubmitFailurePresentation = "deterministic" | "unknown";

export interface SubmitFailureTranscriptCommand {
	commandDisplay?: string;
	stdout: string;
	stderr: string;
	termination: ExecResult["type"];
	exitCode: number | null;
	signal?: string | null;
	error?: string;
}

export interface SubmitFailureTranscript {
	phase: string;
	summary?: string;
	details?: readonly string[];
	commands: readonly SubmitFailureTranscriptCommand[];
}

export type SubmitPreflightResult =
	| {
			kind: "ready";
			output: SubmitCommandOutput;
	  }
	| {
			kind: "restack_required";
			output: SubmitCommandOutput;
	  }
	| {
			kind: "failed";
			output: SubmitCommandOutput;
			cause?: SubmitPreflightFailureCause;
	  };

export type SubmitRestackResult =
	| {
			kind: "success";
			output: SubmitCommandOutput;
	  }
	| {
			kind: "conflict";
			output: SubmitCommandOutput;
			conflictedFiles: string[];
	  }
	| {
			kind: "failed";
			output: SubmitCommandOutput;
	  };

export type SubmitRunResult =
	| {
			kind: "success";
			output: SubmitCommandOutput;
			prLinks: SubmitPrLink[];
			semanticFailureCause?: SubmitSemanticFailureCause;
	  }
	| {
			kind: "failed";
			output: SubmitCommandOutput;
			cause?: SubmitPreflightFailureCause;
	  };

export type CurrentPrVerificationResult =
	| {
			kind: "present";
			output: SubmitCommandOutput;
			prLinks: SubmitPrLink[];
	  }
	| {
			kind: "no_current_pr";
			output: SubmitCommandOutput;
			cause: "no_current_pr";
	  }
	| {
			kind: "failed";
			output: SubmitCommandOutput;
			cause: CurrentPrVerificationFailureCause;
	  };

export interface SubmitGateway {
	checkSubmitReadiness(params: SubmitCommandParams): Promise<SubmitPreflightResult>;
	restackCurrentStack(params: SubmitCommandParams): Promise<SubmitRestackResult>;
	submitCurrentStack(params: SubmitCommandParams): Promise<SubmitRunResult>;
	updateStackPrs(params: SubmitCommandParams): Promise<SubmitRunResult>;
	verifyCurrentPr(params: SubmitCommandParams): Promise<CurrentPrVerificationResult>;
}

export interface SubmitCommandResult {
	exitCode: number;
	stdout: string;
	stderr: string;
	failurePresentation?: SubmitFailurePresentation;
	rawFailureTranscript?: SubmitFailureTranscript;
}

export interface SubmitPrDescriptionOptions {
	githubPr: GithubPrGateway;
	textGenerator: TextGenerator;
	git: GitGateway;
	env: Record<string, string | undefined>;
	time?: TimeServices;
}

export interface RunSubmitCommandOptions {
	cwd: string;
	gateway: SubmitGateway;
	metadataGateway: SubmitMetadataGateway;
	restack: boolean;
	force: boolean;
	shouldForwardCommandOutput?: boolean;
	onOutput?: SubmitOutputListener;
	/** Typed phase sequencing for a presentation driver. Separate channel from the raw `onOutput`. */
	onPhase?: NsProgressPhaseListener;
	submitMatrix?: SubmitMatrixProgressSink;
	confirmRestack?: SubmitRestackConfirmation;
	prDescription: SubmitPrDescriptionOptions;
	shouldRegenerateExistingPrDescriptions?: boolean;
}

export async function runSubmitCommand(
	options: RunSubmitCommandOptions,
): Promise<SubmitCommandResult> {
	const { submitCommandDisplay, submitDryRunCommandDisplay } = formatSubmitCommandDisplays({
		shouldForce: options.force,
	});
	const stackUpdateCommandDisplay = formatStackUpdateCommandDisplay({ shouldForce: options.force });
	const commandParams = submitCommandParams(options);
	emitSubmitPhase(options, { type: "phase-started", phaseKey: "preflight" }, (matrix) =>
		matrix.setGlobal("preflight", { state: "active" }),
	);
	const readiness = await withCommandOperations(
		options.submitMatrix,
		[submitDryRunCommandDisplay],
		() => options.gateway.checkSubmitReadiness(commandParams),
	);
	if (readiness.kind === "failed") {
		options.submitMatrix?.setGlobal("preflight", {
			state: "failed",
			text: "submit readiness failed",
		});
		const preflightFailure = preflightFailureFor({
			result: readiness,
			phase: "preflight",
			submitDryRunCommandDisplay,
		});
		if (preflightFailure !== undefined) return preflightFailure;
		return failure(
			normalizedFailureExitCode(readiness.output),
			formatPreflightFailureOutput(readiness.output, submitDryRunCommandDisplay),
			{
				failurePresentation: "unknown",
				rawFailureTranscript: commandFailureTranscript(
					"preflight",
					submitDryRunCommandDisplay,
					readiness.output,
				),
			},
		);
	}
	if (readiness.kind === "ready") {
		options.submitMatrix?.setGlobal("preflight", { state: "done", text: "ready to submit" });
		options.submitMatrix?.setGlobal("restack", { state: "skipped", text: "not required" });
	}
	if (readiness.kind === "restack_required") {
		options.submitMatrix?.setGlobal("preflight", { state: "done", text: "restack required" });
		emitPhase(options, {
			type: "phase-progress",
			phaseKey: "preflight",
			label: "Graphite requires a restack before submit",
		});
		const restackDecision = await shouldRunRestack(options, readiness.output);
		if (restackDecision === "unavailable") {
			options.submitMatrix?.setGlobal("restack", {
				state: "failed",
				text: "restack required but disabled",
			});
			return deterministicFailure({
				phase: "preflight",
				commandDisplay: submitDryRunCommandDisplay,
				output: readiness.output,
				stderr: formatRestackRequiredOutput(),
				exitCode: 1,
			});
		}
		if (restackDecision === "declined") {
			options.submitMatrix?.setGlobal("restack", { state: "failed", text: "restack declined" });
			return deterministicFailure({
				phase: "preflight",
				commandDisplay: submitDryRunCommandDisplay,
				output: readiness.output,
				stderr: formatRestackDeclinedOutput(),
				exitCode: 1,
			});
		}

		options.submitMatrix?.setGlobal("restack", { state: "active" });
		const restackFailure = await withCommandOperations(
			options.submitMatrix,
			[RESTACK_COMMAND_DISPLAY],
			() => runRestackBeforeSubmit(options, commandParams),
		);
		if (restackFailure !== undefined) {
			options.submitMatrix?.setGlobal("restack", { state: "failed", text: "restack failed" });
			return restackFailure;
		}

		const rechecked = await withCommandOperations(
			options.submitMatrix,
			[submitDryRunCommandDisplay],
			() => options.gateway.checkSubmitReadiness(commandParams),
		);
		const recheckPreflightFailure = preflightFailureFor({
			result: rechecked,
			phase: "readiness recheck",
			submitDryRunCommandDisplay,
		});
		if (recheckPreflightFailure !== undefined) {
			options.submitMatrix?.setGlobal("restack", {
				state: "failed",
				text: "readiness recheck failed",
			});
			return recheckPreflightFailure;
		}
		if (rechecked.kind !== "ready") {
			options.submitMatrix?.setGlobal("restack", {
				state: "failed",
				text: "readiness recheck failed",
			});
			return deterministicFailure({
				phase: "readiness recheck",
				commandDisplay: submitDryRunCommandDisplay,
				output: rechecked.output,
				stderr: formatReadinessRecheckFailureOutput(submitDryRunCommandDisplay),
			});
		}
		options.submitMatrix?.setGlobal("restack", { state: "done", text: "restack complete" });
	}

	emitPhase(options, { type: "phase-started", phaseKey: "metadata" });
	// The metadata workflow reports its own operations (model generation and each `gt modify`
	// amendment) at their true source, so no broad command snapshot wraps this phase.
	const prewrite = await prepareSubmitPrMetadata({
		cwd: options.cwd,
		env: options.prDescription.env,
		gateway: options.metadataGateway,
		git: options.prDescription.git,
		textGenerator: options.prDescription.textGenerator,
		...(options.prDescription.time === undefined ? {} : { time: options.prDescription.time }),
		progress: submitPhaseProgressListeners<SubmitBranchMetadataProgressEvent>(
			options,
			"metadata",
			(event) => {
				const text =
					event.reason === undefined ? undefined : compactSubmitMetadataCellText(event.reason);
				options.submitMatrix?.setCell(event.branch, "metadata", {
					state: event.state,
					...optionalEntry("text", text),
				});
			},
		),
	});
	if (prewrite.kind === "failed") {
		const stderr = formatPrewriteFailureOutput({
			error: prewrite.error,
			amendedBranches: prewrite.amendedBranches,
			...(prewrite.diagnostic === undefined ? {} : { diagnostic: prewrite.diagnostic }),
		});
		const details =
			prewrite.diagnostic === undefined ? [] : formatErrorInfoDiagnosticLines(prewrite.diagnostic);
		return failure(prewrite.exitCode ?? 1, stderr, {
			failurePresentation: "unknown",
			rawFailureTranscript: textFailureTranscript("pre-submit metadata", stderr, details),
		});
	}

	emitSubmitPhase(
		options,
		{
			type: "phase-started",
			phaseKey: "submit",
			label: submitCommandDisplay,
		},
		(matrix) => matrix.setGlobal("submit", { state: "active", text: submitCommandDisplay }),
	);
	const submittedStep = await runSubmitPhaseStep({
		options,
		phaseLabel: "submit",
		commandDisplay: submitCommandDisplay,
		prepared: prewrite.prepared,
		knownFailurePhase: "submit preflight",
		run: (gateway, params) => gateway.submitCurrentStack(params),
	});
	if (submittedStep.kind === "failure") return submittedStep.failure;

	let combinedSubmitOutcome = submittedStep.result;
	if (prewrite.hasUpstackBranches) {
		emitPhase(options, {
			type: "phase-progress",
			phaseKey: "submit",
			label: stackUpdateCommandDisplay,
		});
		options.submitMatrix?.setGlobal("submit", {
			state: "active",
			text: "updating upstack PRs",
		});
		const stackUpdateStep = await runSubmitPhaseStep({
			options,
			phaseLabel: "stack update",
			commandDisplay: stackUpdateCommandDisplay,
			prepared: prewrite.prepared,
			run: (gateway, params) => gateway.updateStackPrs(params),
		});
		if (stackUpdateStep.kind === "failure") return stackUpdateStep.failure;

		combinedSubmitOutcome = combineSubmitOutcomes(combinedSubmitOutcome, stackUpdateStep.result);
	}

	options.submitMatrix?.setGlobal("submit", { state: "done", text: "stack submitted" });
	emitSubmitPhase(options, { type: "phase-started", phaseKey: "verification" }, (matrix) =>
		matrix.setGlobal("verify", { state: "active", text: "checking current PR" }),
	);
	const currentPr = await withCommandOperations(
		options.submitMatrix,
		[CURRENT_PR_COMMAND_DISPLAY],
		() => options.gateway.verifyCurrentPr(commandParams),
	);
	if (
		combinedSubmitOutcome.semanticFailureCause !== undefined ||
		shouldFailPostSubmitVerification(combinedSubmitOutcome, currentPr)
	) {
		options.submitMatrix?.setGlobal("verify", { state: "failed", text: "verification failed" });
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
			rawFailureTranscript: postSubmitFailureTranscript(
				stderr,
				combinedSubmitOutcome,
				currentPr,
				submitCommandDisplay,
			),
		});
	}

	const prLinks =
		currentPr.kind === "present"
			? mergePrLinks(combinedSubmitOutcome.prLinks, currentPr.prLinks)
			: mergePrLinks(combinedSubmitOutcome.prLinks, []);
	options.submitMatrix?.applyPrLinks(prLinks);
	if (currentPr.kind === "present") {
		options.submitMatrix?.setGlobal("verify", {
			state: "done",
			text: formatVerifiedCurrentPrText(currentPr.prLinks),
		});
	} else {
		options.submitMatrix?.setGlobal("verify", {
			state: "skipped",
			text: "current PR not detected",
		});
	}
	const shouldRegenerateExistingPrDescriptions =
		options.shouldRegenerateExistingPrDescriptions === true;
	const partitionedPrLinks = shouldRegenerateExistingPrDescriptions
		? { newPrLinks: prLinks, existingPrLinks: [] }
		: partitionPrLinksByExisting(prLinks, prewrite.existingPrLinks);
	const descriptionPrLinks = partitionedPrLinks.newPrLinks;
	const skippedExistingPrLinks = partitionedPrLinks.existingPrLinks;
	emitSubmitPhase(
		options,
		{
			type: "phase-started",
			phaseKey: "descriptions",
			label: formatDescriptionPhaseStart(descriptionPrLinks.length, skippedExistingPrLinks.length),
		},
		(matrix) => {
			if (prLinks.length === 0) matrix.setAllCells("description", { state: "skipped" });
		},
	);
	options.submitMatrix?.setActiveOperations([]);
	for (const link of skippedExistingPrLinks) {
		const number = prNumberFromLink(link);
		if (number !== undefined) {
			options.submitMatrix?.setCellByPrNumber(number, "description", {
				state: "skipped",
				text: "existing PR",
			});
		}
	}
	const descriptionResult = await generateSubmitPrDescriptions({
		cwd: options.cwd,
		prDescription: options.prDescription,
		prLinks: descriptionPrLinks,
		prewrittenMetadata: prewrite.prepared,
		progress: submitPhaseProgressListeners<SubmitPrDescriptionProgressEvent>(
			options,
			"descriptions",
			(event) => {
				options.submitMatrix?.setCellByPrNumber(event.prNumber, "description", {
					state: event.state,
					...optionalEntry("text", event.message),
				});
			},
		),
	});
	options.submitMatrix?.setActiveOperations([]);
	if (!descriptionResult.ok) {
		const stderr = formatPrDescriptionFailureText(prLinks, descriptionResult.failures);
		const details = formatPrDescriptionFailureDiagnostics(descriptionResult.failures);
		return failure(1, stderr, {
			failurePresentation: "deterministic",
			rawFailureTranscript: textFailureTranscript("PR description", stderr, details),
		});
	}

	options.submitMatrix?.setPendingCells("description", { state: "skipped" });
	const successText =
		prLinks.length > 0
			? formatSubmitSuccessText(prLinks, descriptionResult)
			: formatSubmitSuccessFallbackText(
					combinedSubmitOutcome.output.stdout,
					combinedSubmitOutcome.output.stderr,
				);
	return success(successText);
}

type RestackDecision = "run" | "declined" | "unavailable";

function formatDescriptionPhaseStart(prCount: number, skippedExistingCount: number): string {
	if (prCount === 0 && skippedExistingCount === 0) {
		return "checking PR descriptions; no PR links detected yet";
	}
	if (prCount === 0) {
		return `skipping ${formatItemCount(skippedExistingCount, "existing PR description", "existing PR descriptions")}`;
	}
	return `checking ${formatItemCount(prCount, "PR description", "PR descriptions")} for skip or regeneration`;
}

function formatVerifiedCurrentPrText(prLinks: readonly SubmitPrLink[]): string {
	const prNumber = prLinks.map(prNumberFromLink).find((number) => number !== undefined);
	if (prNumber === undefined) return "current PR verified";
	return `current PR verified (#${prNumber})`;
}

function preflightFailureFor(input: {
	result: SubmitPreflightResult;
	phase: string;
	submitDryRunCommandDisplay: string;
}): SubmitCommandResult | undefined {
	if (input.result.kind !== "failed") return undefined;
	return knownSubmitFailureFor({
		cause: input.result.cause,
		output: input.result.output,
		phase: input.phase,
		transcriptCommandDisplay: input.submitDryRunCommandDisplay,
	});
}

function knownSubmitFailureFor(input: {
	cause: SubmitPreflightFailureCause | undefined;
	output: SubmitCommandOutput;
	phase: string;
	transcriptCommandDisplay: string;
	prewrittenMetadata?: readonly PrewrittenPrMetadata[];
}): SubmitCommandResult | undefined {
	if (input.cause === undefined) return undefined;

	return deterministicFailure({
		phase: input.phase,
		commandDisplay: input.transcriptCommandDisplay,
		output: input.output,
		stderr: formatPreflightCauseOutput({
			cause: input.cause,
			output: input.output,
			prewrittenMetadata: input.prewrittenMetadata ?? [],
		}),
	});
}

function formatPreflightCauseOutput(input: {
	cause: SubmitPreflightFailureCause;
	output: SubmitCommandOutput;
	prewrittenMetadata: readonly PrewrittenPrMetadata[];
}): string {
	const message = formatSubmitPreflightFailureCause(input.cause, input.output);
	const advisory = formatPrewrittenMetadataAdvisory(
		input.prewrittenMetadata,
		"Local PR metadata commit messages were prepared before submit; verify the metadata after resolving the Graphite failure.",
	);
	return [message, ...(advisory.length === 0 ? [] : ["", ...advisory])].join("\n");
}

async function shouldRunRestack(
	options: Pick<RunSubmitCommandOptions, "restack" | "force" | "confirmRestack">,
	output: SubmitCommandOutput,
): Promise<RestackDecision> {
	if (options.restack) return "run";
	if (options.confirmRestack === undefined) return "unavailable";

	const confirmed = await options.confirmRestack(
		formatRestackConfirmationPrompt(
			output,
			formatSubmitCommandDisplays({ shouldForce: options.force }),
		),
	);
	return confirmed ? "run" : "declined";
}

async function runRestackBeforeSubmit(
	options: Pick<RunSubmitCommandOptions, "gateway" | "onOutput" | "onPhase">,
	commandParams: SubmitCommandParams,
): Promise<SubmitCommandResult | undefined> {
	emitPhase(options, {
		type: "phase-progress",
		phaseKey: "preflight",
		label: "running gt restack",
	});
	const restack = await options.gateway.restackCurrentStack(commandParams);
	if (restack.kind === "conflict") {
		return deterministicFailure({
			phase: "restack",
			commandDisplay: RESTACK_COMMAND_DISPLAY,
			output: restack.output,
			stderr: formatRestackConflictOutput(restack.conflictedFiles),
			exitCode: 1,
		});
	}
	if (restack.kind === "failed") {
		return failure(
			normalizedFailureExitCode(restack.output),
			formatRestackFailureOutput(restack.output),
			{
				failurePresentation: "unknown",
				rawFailureTranscript: commandFailureTranscript(
					"restack",
					RESTACK_COMMAND_DISPLAY,
					restack.output,
				),
			},
		);
	}
	return undefined;
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
	options: Pick<RunSubmitCommandOptions, "cwd" | "force" | "gateway" | "onOutput" | "submitMatrix">;
	phaseLabel: string;
	commandDisplay: string;
	prepared: readonly PrewrittenPrMetadata[];
	knownFailurePhase?: string;
	run: (gateway: SubmitGateway, params: SubmitCommandParams) => Promise<SubmitRunResult>;
}): Promise<SubmitPhaseStepResult> {
	const result = await withCommandOperations(
		input.options.submitMatrix,
		[input.commandDisplay],
		() => input.run(input.options.gateway, submitStreamingCommandParams(input.options)),
	);
	if (result.kind === "success") return { kind: "success", result };

	input.options.submitMatrix?.setGlobal("submit", {
		state: "failed",
		text: `${input.phaseLabel} failed`,
	});
	if (input.knownFailurePhase !== undefined) {
		const knownFailure = knownSubmitFailureFor({
			cause: result.cause,
			output: result.output,
			phase: input.knownFailurePhase,
			transcriptCommandDisplay: input.commandDisplay,
			prewrittenMetadata: input.prepared,
		});
		if (knownFailure !== undefined) return { kind: "failure", failure: knownFailure };
	}

	return {
		kind: "failure",
		failure: failure(
			normalizedFailureExitCode(result.output),
			formatSubmitFailureOutput(result.output, input.prepared, input.commandDisplay),
			{
				failurePresentation: "unknown",
				rawFailureTranscript: commandFailureTranscript(
					input.phaseLabel,
					input.commandDisplay,
					result.output,
				),
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
	options: Pick<RunSubmitCommandOptions, "onPhase">,
	event: NsProgressPhaseEvent,
): void {
	options.onPhase?.(event);
}

function emitSubmitPhase(
	options: Pick<RunSubmitCommandOptions, "onPhase" | "submitMatrix">,
	event: NsProgressPhaseEvent,
	updateMatrix: (matrix: SubmitMatrixProgressSink) => void,
): void {
	emitPhase(options, event);
	if (options.submitMatrix !== undefined) updateMatrix(options.submitMatrix);
}

function submitPhaseProgressListeners<ItemProgressEvent>(
	options: Pick<RunSubmitCommandOptions, "onPhase" | "submitMatrix">,
	phaseKey: string,
	onItemProgress: (event: ItemProgressEvent) => void,
): SubmitProgressListeners<ItemProgressEvent> {
	return {
		onProgress: (message) =>
			emitPhase(options, { type: "phase-progress", phaseKey, label: message }),
		onActiveOperations: (operations) => options.submitMatrix?.setActiveOperations(operations),
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

function normalizedFailureExitCode(output: SubmitCommandOutput): number {
	switch (output.type) {
		case "spawn-failed":
			return 2;
		case "timed-out":
			return 124;
		case "cancelled":
			return 130;
		case "exited":
			return output.signal === null && output.code !== null && output.code !== 0 ? output.code : 1;
	}
}

function success(stdout: string): SubmitCommandResult {
	return {
		exitCode: 0,
		stdout: stdout.endsWith("\n") ? stdout : `${stdout}\n`,
		stderr: "",
	};
}

interface SubmitFailureResultOptions {
	failurePresentation: SubmitFailurePresentation;
	rawFailureTranscript?: SubmitFailureTranscript;
}

function failure(
	exitCode: number,
	stderr: string,
	options?: SubmitFailureResultOptions,
): SubmitCommandResult {
	return {
		exitCode,
		stdout: "",
		stderr: stderr.endsWith("\n") ? stderr : `${stderr}\n`,
		...(options?.failurePresentation === undefined
			? {}
			: { failurePresentation: options.failurePresentation }),
		...(options?.rawFailureTranscript === undefined
			? {}
			: { rawFailureTranscript: options.rawFailureTranscript }),
	};
}

function deterministicFailure(input: {
	phase: string;
	commandDisplay: string;
	output: SubmitCommandOutput;
	stderr: string;
	exitCode?: number;
}): SubmitCommandResult {
	return failure(input.exitCode ?? normalizedFailureExitCode(input.output), input.stderr, {
		failurePresentation: "deterministic",
		rawFailureTranscript: commandFailureTranscript(
			input.phase,
			input.commandDisplay,
			input.output,
			input.stderr,
		),
	});
}

function commandFailureTranscript(
	phase: string,
	commandDisplay: string,
	output: SubmitCommandOutput,
	summary?: string,
): SubmitFailureTranscript {
	return {
		phase,
		...(summary === undefined || summary.trim() === "" ? {} : { summary: summary.trimEnd() }),
		commands: [{ commandDisplay, ...failureTranscriptFields(output) }],
	};
}

function textFailureTranscript(
	phase: string,
	summary: string,
	details?: readonly string[],
): SubmitFailureTranscript {
	return {
		phase,
		summary,
		...(details === undefined || details.length === 0 ? {} : { details }),
		commands: [],
	};
}

function postSubmitFailureTranscript(
	summary: string,
	submitted: Extract<SubmitRunResult, { kind: "success" }>,
	currentPr: CurrentPrVerificationResult,
	submitCommandDisplay: string,
): SubmitFailureTranscript {
	return {
		phase: "post-submit verification",
		summary,
		commands: [
			{ commandDisplay: submitCommandDisplay, ...failureTranscriptFields(submitted.output) },
			{ commandDisplay: CURRENT_PR_COMMAND_DISPLAY, ...failureTranscriptFields(currentPr.output) },
		],
	};
}

function failureTranscriptFields(
	output: SubmitCommandOutput,
): Omit<SubmitFailureTranscriptCommand, "commandDisplay"> {
	return {
		stdout: output.stdout,
		stderr: output.stderr,
		termination: output.type,
		exitCode: output.type === "spawn-failed" ? null : output.code,
		...(output.type === "spawn-failed" ? { error: output.error } : { signal: output.signal }),
	};
}

function mergePrLinks(
	first: readonly SubmitPrLink[],
	second: readonly SubmitPrLink[],
): SubmitPrLink[] {
	const links: SubmitPrLink[] = [];
	const seenKeys = new Set<string>();
	for (const link of [...first, ...second]) {
		const key = prLinkIdentityKey(link);
		if (seenKeys.has(key)) continue;
		seenKeys.add(key);
		links.push({ ...link });
	}
	return links;
}

function partitionPrLinksByExisting(
	links: readonly SubmitPrLink[],
	existingLinks: readonly SubmitPrLink[],
): { newPrLinks: SubmitPrLink[]; existingPrLinks: SubmitPrLink[] } {
	const existingKeys = new Set(existingLinks.map(prLinkIdentityKey));
	const newPrLinks: SubmitPrLink[] = [];
	const matchedExistingPrLinks: SubmitPrLink[] = [];
	for (const link of links) {
		if (existingKeys.has(prLinkIdentityKey(link))) {
			matchedExistingPrLinks.push(link);
		} else {
			newPrLinks.push(link);
		}
	}
	return { newPrLinks, existingPrLinks: matchedExistingPrLinks };
}

function prLinkIdentityKey(link: SubmitPrLink): string {
	const number = prNumberFromLink(link);
	return number === undefined ? link.url : `pr:${number}`;
}
