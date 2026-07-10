import { type ExecOutputListener, type ExecOutputStream } from "@nseng-ai/foundation/command";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import type { GitGateway } from "@nseng-ai/capability-kit/git";
import { formatErrorInfoDiagnosticLines } from "@nseng-ai/capability-kit/gateway-result";

import type { GithubPrGateway, PrewrittenPrMetadata, TextGenerator } from "./index.ts";
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
	prewriteSubmitMetadata,
	type SubmitMetadataGateway,
} from "./submit-pr-metadata-prewrite.ts";
import { buildSubmitPlan, type SubmitPlan } from "./submit-plan.ts";
import {
	formatPrDescriptionFailureDiagnostics,
	formatPrDescriptionFailureText,
	generateSubmitPrDescriptions,
} from "./submit-pr-descriptions.ts";
import {
	formatStackUpdateCommandDisplay,
	formatSubmitCommandDisplays,
} from "./submit-command-spec.ts";
import { mergePrLinks, partitionPrLinksByExisting, prNumberFromLink } from "./submit-pr-link.ts";
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

export interface SubmitCommandOutput {
	stdout: string;
	stderr: string;
	exitCode: number;
	startupError?: string;
	killed?: boolean;
}

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
	exitCode: number;
	startupError?: string;
	killed?: boolean;
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
	const readinessFailure = await ensureSubmitReadiness();
	if (readinessFailure !== undefined) return readinessFailure;

	async function ensureSubmitReadiness(): Promise<SubmitCommandResult | undefined> {
		emitSubmitPhase(options, { type: "phase-started", phaseKey: "preflight" }, (matrix) =>
			matrix.setGlobal("preflight", { state: "active" }),
		);
		options.submitMatrix?.setRunningCommands([submitDryRunCommandDisplay]);
		const readiness = await options.gateway.checkSubmitReadiness(commandParams);
		options.submitMatrix?.setRunningCommands([]);
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
			options.submitMatrix?.setRunningCommands([RESTACK_COMMAND_DISPLAY]);
			const restackFailure = await runRestackBeforeSubmit(options, commandParams);
			options.submitMatrix?.setRunningCommands([]);
			if (restackFailure !== undefined) {
				options.submitMatrix?.setGlobal("restack", { state: "failed", text: "restack failed" });
				return restackFailure;
			}

			options.submitMatrix?.setRunningCommands([submitDryRunCommandDisplay]);
			const rechecked = await options.gateway.checkSubmitReadiness(commandParams);
			options.submitMatrix?.setRunningCommands([]);
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
		return undefined;
	}

	emitSubmitPhase(options, { type: "phase-started", phaseKey: "metadata" }, (matrix) =>
		matrix.setRunningCommands([
			"gt log --stack --reverse --no-interactive",
			"gt trunk --no-interactive",
			"gt branch info --no-interactive --branch <stack-branch>",
			"git log --format=%B%x00 <parent>..<branch>",
			"git diff <parent>..<branch>",
			"gt modify --no-interactive",
		]),
	);
	const planned = await buildSubmitPlan({
		cwd: options.cwd,
		gateway: options.metadataGateway,
		onProgress: (message) =>
			emitPhase(options, { type: "phase-progress", phaseKey: "metadata", label: message }),
	});
	if (planned.kind === "failed") {
		options.submitMatrix?.setRunningCommands([]);
		const stderr = formatPrewriteFailureOutput({ error: planned.error, amendedBranches: [] });
		return failure(1, stderr, {
			failurePresentation: "unknown",
			rawFailureTranscript: textFailureTranscript("pre-submit metadata", stderr, []),
		});
	}
	const plan = planned.plan;
	const prewrite = await prewriteSubmitMetadata(plan, {
		cwd: options.cwd,
		env: options.prDescription.env,
		gateway: options.metadataGateway,
		git: options.prDescription.git,
		textGenerator: options.prDescription.textGenerator,
		onProgress: (message) =>
			emitPhase(options, { type: "phase-progress", phaseKey: "metadata", label: message }),
		onBranchProgress: (event) => {
			const text =
				event.reason === undefined ? undefined : compactSubmitMetadataCellText(event.reason);
			options.submitMatrix?.setCell(event.branch, "metadata", {
				state: event.state,
				...optionalEntry("text", text),
			});
		},
	});
	options.submitMatrix?.setRunningCommands([]);
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

	return executeSubmitPlan(plan, prewrite.prepared);

	async function executeSubmitPlan(
		planToExecute: SubmitPlan,
		prepared: readonly PrewrittenPrMetadata[],
	): Promise<SubmitCommandResult> {
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
			prepared,
			knownFailurePhase: "submit preflight",
			run: (gateway, params) => gateway.submitCurrentStack(params),
		});
		if (submittedStep.kind === "failure") return submittedStep.failure;

		let combinedSubmitOutcome = submittedStep.result;
		if (planToExecute.hasUpstackBranches) {
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
				prepared,
				run: (gateway, params) => gateway.updateStackPrs(params),
			});
			if (stackUpdateStep.kind === "failure") return stackUpdateStep.failure;

			combinedSubmitOutcome = combineSubmitOutcomes(combinedSubmitOutcome, stackUpdateStep.result);
		}

		options.submitMatrix?.setGlobal("submit", { state: "done", text: "stack submitted" });
		emitSubmitPhase(options, { type: "phase-started", phaseKey: "verification" }, (matrix) =>
			matrix.setGlobal("verify", { state: "active", text: "checking current PR" }),
		);
		options.submitMatrix?.setRunningCommands([CURRENT_PR_COMMAND_DISPLAY]);
		const currentPr = await options.gateway.verifyCurrentPr(commandParams);
		options.submitMatrix?.setRunningCommands([]);
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
			: partitionPrLinksByExisting(prLinks, planToExecute.existingPrLinks);
		const descriptionPrLinks = partitionedPrLinks.newPrLinks;
		const skippedExistingPrLinks = partitionedPrLinks.existingPrLinks;
		emitSubmitPhase(
			options,
			{
				type: "phase-started",
				phaseKey: "descriptions",
				label: formatDescriptionPhaseStart(
					descriptionPrLinks.length,
					skippedExistingPrLinks.length,
				),
			},
			(matrix) => {
				if (prLinks.length === 0) matrix.setAllCells("description", { state: "skipped" });
			},
		);
		options.submitMatrix?.setRunningCommands(
			descriptionPrLinks.length === 0 ? [] : ["PR description text generation / GitHub update"],
		);
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
			prewrittenMetadata: prepared,
			onProgress: (message) =>
				emitPhase(options, { type: "phase-progress", phaseKey: "descriptions", label: message }),
			onPrProgress: (event) => {
				options.submitMatrix?.setCellByPrNumber(event.prNumber, "description", {
					state: event.state,
					...optionalEntry("text", event.message),
				});
			},
		});
		options.submitMatrix?.setRunningCommands([]);
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
	input.options.submitMatrix?.setRunningCommands([input.commandDisplay]);
	const result = await input.run(
		input.options.gateway,
		submitStreamingCommandParams(input.options),
	);
	input.options.submitMatrix?.setRunningCommands([]);
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

function shouldFailPostSubmitVerification(
	submitted: Extract<SubmitRunResult, { kind: "success" }>,
	currentPr: CurrentPrVerificationResult,
): boolean {
	if (currentPr.kind === "present") return false;
	if (currentPr.kind === "no_current_pr" && submitted.prLinks.length > 0) return false;
	return true;
}

function normalizedFailureExitCode(output: SubmitCommandOutput): number {
	if (output.startupError !== undefined) return 2;
	if (output.killed === true) return 124;
	return output.exitCode === 0 ? 1 : output.exitCode;
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
		commands: [
			{
				commandDisplay,
				stdout: output.stdout,
				stderr: output.stderr,
				exitCode: normalizedFailureExitCode(output),
				...(output.startupError === undefined ? {} : { startupError: output.startupError }),
				...(output.killed === true ? { killed: true } : {}),
			},
		],
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
			{
				commandDisplay: submitCommandDisplay,
				stdout: submitted.output.stdout,
				stderr: submitted.output.stderr,
				exitCode: submitted.output.exitCode,
				...(submitted.output.startupError === undefined
					? {}
					: { startupError: submitted.output.startupError }),
				...(submitted.output.killed === true ? { killed: true } : {}),
			},
			{
				commandDisplay: CURRENT_PR_COMMAND_DISPLAY,
				stdout: currentPr.output.stdout,
				stderr: currentPr.output.stderr,
				exitCode: currentPr.output.exitCode,
				...(currentPr.output.startupError === undefined
					? {}
					: { startupError: currentPr.output.startupError }),
				...(currentPr.output.killed === true ? { killed: true } : {}),
			},
		],
	};
}
