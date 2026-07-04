import { type ExecOutputListener, type ExecOutputStream } from "@ns/core/command";
import type { GitGateway } from "@ns/capability-kit/git";

import type { GithubPrGateway, TextGenerator } from "./index.ts";
import type { SubmitPrLink } from "./gt-output.ts";
import {
	formatSubmitPreflightFailureCause,
	type CurrentPrVerificationFailureCause,
	type SubmitPreflightFailureCause,
	type SubmitSemanticFailureCause,
} from "./submit-failure-catalog.ts";
import {
	formatPostSubmitFailureOutput,
	formatPreflightFailureOutput,
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
	type SubmitMetadataGateway,
} from "./submit-pr-metadata-prewrite.ts";
import {
	formatPrDescriptionFailureDiagnostics,
	formatPrDescriptionFailureText,
	generateSubmitPrDescriptions,
} from "./submit-pr-descriptions.ts";
import { formatSubmitCommandDisplays } from "./submit-command-spec.ts";
import { prNumberFromLink } from "./submit-pr-link.ts";
import type { SdlProgressPhaseEvent, SdlProgressPhaseListener } from "@ns/kernel/sdk";

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
	onPhase?: SdlProgressPhaseListener;
	confirmRestack?: SubmitRestackConfirmation;
	prDescription: SubmitPrDescriptionOptions;
}

export async function runSubmitCommand(
	options: RunSubmitCommandOptions,
): Promise<SubmitCommandResult> {
	const { submitCommandDisplay, submitDryRunCommandDisplay } = formatSubmitCommandDisplays({
		shouldForce: options.force,
	});
	const commandParams = submitCommandParams(options);
	emitPhase(options, { type: "phase-started", phaseKey: "preflight" });
	const readiness = await options.gateway.checkSubmitReadiness(commandParams);
	if (readiness.kind === "failed") {
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
	if (readiness.kind === "restack_required") {
		emitPhase(options, {
			type: "phase-progress",
			phaseKey: "preflight",
			label: "Graphite requires a restack before submit",
		});
		const restackDecision = await shouldRunRestack(options, readiness.output);
		if (restackDecision === "unavailable") {
			return deterministicFailure({
				phase: "preflight",
				commandDisplay: submitDryRunCommandDisplay,
				output: readiness.output,
				stderr: formatRestackRequiredOutput(),
				exitCode: 1,
			});
		}
		if (restackDecision === "declined") {
			return deterministicFailure({
				phase: "preflight",
				commandDisplay: submitDryRunCommandDisplay,
				output: readiness.output,
				stderr: formatRestackDeclinedOutput(),
				exitCode: 1,
			});
		}

		const restackFailure = await runRestackBeforeSubmit(options, commandParams);
		if (restackFailure !== undefined) {
			return restackFailure;
		}

		const rechecked = await options.gateway.checkSubmitReadiness(commandParams);
		const recheckPreflightFailure = preflightFailureFor({
			result: rechecked,
			phase: "readiness recheck",
			submitDryRunCommandDisplay,
		});
		if (recheckPreflightFailure !== undefined) return recheckPreflightFailure;
		if (rechecked.kind !== "ready") {
			return deterministicFailure({
				phase: "readiness recheck",
				commandDisplay: submitDryRunCommandDisplay,
				output: rechecked.output,
				stderr: formatReadinessRecheckFailureOutput(submitDryRunCommandDisplay),
			});
		}
	}

	emitPhase(options, { type: "phase-started", phaseKey: "metadata" });
	const prewrite = await prepareSubmitPrMetadata({
		cwd: options.cwd,
		env: options.prDescription.env,
		gateway: options.metadataGateway,
		git: options.prDescription.git,
		textGenerator: options.prDescription.textGenerator,
		onProgress: (message) =>
			emitPhase(options, { type: "phase-progress", phaseKey: "metadata", label: message }),
	});
	if (prewrite.kind === "failed") {
		const stderr = formatPrewriteFailureOutput(prewrite.error, prewrite.amendedBranches);
		return failure(prewrite.exitCode ?? 1, stderr, {
			failurePresentation: "unknown",
			rawFailureTranscript: textFailureTranscript("pre-submit metadata", stderr),
		});
	}

	emitPhase(options, {
		type: "phase-started",
		phaseKey: "submit",
		label: submitCommandDisplay,
	});
	const submitted = await options.gateway.submitCurrentStack(submitStreamingCommandParams(options));
	if (submitted.kind === "failed") {
		const submitPreflightFailure = knownSubmitFailureFor({
			cause: submitted.cause,
			output: submitted.output,
			phase: "submit preflight",
			transcriptCommandDisplay: submitCommandDisplay,
		});
		if (submitPreflightFailure !== undefined) return submitPreflightFailure;

		return failure(
			normalizedFailureExitCode(submitted.output),
			formatSubmitFailureOutput(submitted.output, prewrite.prepared, submitCommandDisplay),
			{
				failurePresentation: "unknown",
				rawFailureTranscript: commandFailureTranscript(
					"submit",
					submitCommandDisplay,
					submitted.output,
				),
			},
		);
	}

	emitPhase(options, { type: "phase-started", phaseKey: "verification" });
	const currentPr = await options.gateway.verifyCurrentPr(commandParams);
	if (
		submitted.semanticFailureCause !== undefined ||
		shouldFailPostSubmitVerification(submitted, currentPr)
	) {
		const stderr = formatPostSubmitFailureOutput({
			submitted,
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
				submitted,
				currentPr,
				submitCommandDisplay,
			),
		});
	}

	const prLinks =
		currentPr.kind === "present"
			? mergePrLinks(submitted.prLinks, currentPr.prLinks)
			: mergePrLinks(submitted.prLinks, []);
	emitPhase(options, {
		type: "phase-started",
		phaseKey: "descriptions",
		label: formatDescriptionPhaseStart(prLinks.length),
	});
	const descriptionResult = await generateSubmitPrDescriptions({
		cwd: options.cwd,
		prDescription: options.prDescription,
		prLinks,
		prewrittenMetadata: prewrite.prepared,
		onProgress: (message) =>
			emitPhase(options, { type: "phase-progress", phaseKey: "descriptions", label: message }),
	});
	if (!descriptionResult.ok) {
		const stderr = formatPrDescriptionFailureText(prLinks, descriptionResult.failures);
		const details = formatPrDescriptionFailureDiagnostics(descriptionResult.failures);
		return failure(1, stderr, {
			failurePresentation: "deterministic",
			rawFailureTranscript: textFailureTranscript(
				"PR description",
				stderr,
				details.length === 0 ? {} : { details },
			),
		});
	}

	const successText =
		prLinks.length > 0
			? formatSubmitSuccessText(prLinks, {
					generated: descriptionResult.generated,
					skipped: descriptionResult.skipped,
					prewritten: descriptionResult.prewritten,
					prewriteFallbacks: descriptionResult.prewriteFallbacks,
					previews: descriptionResult.previews,
				})
			: formatSubmitSuccessFallbackText(submitted.output.stdout, submitted.output.stderr);
	return success(successText);
}

type RestackDecision = "run" | "declined" | "unavailable";

function formatDescriptionPhaseStart(prCount: number): string {
	if (prCount === 0) return "checking PR descriptions; no PR links detected yet";
	return `checking ${formatItemCount(prCount, "PR description", "PR descriptions")} for skip or regeneration`;
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
}): SubmitCommandResult | undefined {
	if (input.cause === undefined) return undefined;

	return deterministicFailure({
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
	event: SdlProgressPhaseEvent,
): void {
	options.onPhase?.(event);
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
	options?: { details?: readonly string[] },
): SubmitFailureTranscript {
	return {
		phase,
		summary,
		...(options?.details === undefined ? {} : { details: options.details }),
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

function prLinkIdentityKey(link: SubmitPrLink): string {
	const number = prNumberFromLink(link);
	return number === undefined ? link.url : `pr:${number}`;
}
