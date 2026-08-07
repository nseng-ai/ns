import { optionalEntry } from "@nseng-ai/foundation/primitives";

import type {
	CurrentPrVerificationResult,
	SubmitCommandOutput,
	SubmitFailurePresentation,
	SubmitFailureTranscript,
	SubmitFailureTranscriptCommand,
	SubmitResult,
	SubmitRunResult,
} from "./submit-contracts.ts";
import type { SubmitPrLink } from "./gt-output.ts";

export const POST_METADATA_GRAPHITE_FAILURE_ADVISORY =
	"Local PR metadata commit messages were prepared before submit; verify the metadata after resolving the Graphite failure.";

export interface SubmitFailureResultOptions {
	failurePresentation: SubmitFailurePresentation;
	rawFailureTranscript?: SubmitFailureTranscript;
	publishedPrs?: readonly SubmitPrLink[];
	metadataApplied?: readonly SubmitPrLink[];
	type?: "refused" | "failed";
}

export function submitFailureResult(
	phase: string,
	message: string,
	options: SubmitFailureResultOptions,
): SubmitResult {
	return {
		type: options.type ?? "failed",
		phase,
		message: message.endsWith("\n") ? message : `${message}\n`,
		failurePresentation: options.failurePresentation,
		publishedPrs: options.publishedPrs ?? [],
		metadataApplied: options.metadataApplied ?? [],
		...optionalEntry("rawFailureTranscript", options.rawFailureTranscript),
	};
}

export function deterministicSubmitCommandFailure(input: {
	phase: string;
	commandDisplay: string;
	output: SubmitCommandOutput;
	stderr: string;
	type?: "refused" | "failed";
}): SubmitResult {
	return submitFailureResult(input.phase, input.stderr, {
		failurePresentation: "deterministic",
		...optionalEntry("type", input.type),
		rawFailureTranscript: submitCommandFailureTranscript({
			phase: input.phase,
			commandDisplay: input.commandDisplay,
			output: input.output,
			summary: input.stderr,
		}),
	});
}

export function unknownSubmitCommandFailure(input: {
	phase: string;
	commandDisplay: string;
	output: SubmitCommandOutput;
	stderr: string;
}): SubmitResult {
	return submitFailureResult(input.phase, input.stderr, {
		failurePresentation: "unknown",
		rawFailureTranscript: submitCommandFailureTranscript({
			phase: input.phase,
			commandDisplay: input.commandDisplay,
			output: input.output,
		}),
	});
}

export function normalizedSubmitFailureExitCode(output: SubmitCommandOutput): number {
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

export function submitCommandFailureTranscript(options: {
	readonly phase: string;
	readonly commandDisplay: string;
	readonly output: SubmitCommandOutput;
	readonly summary?: string;
}): SubmitFailureTranscript {
	return {
		phase: options.phase,
		...(options.summary === undefined || options.summary.trim() === ""
			? {}
			: { summary: options.summary.trimEnd() }),
		commands: [
			{ commandDisplay: options.commandDisplay, ...submitFailureTranscriptFields(options.output) },
		],
	};
}

export function submitTextFailureTranscript(
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

export function postSubmitFailureTranscript(options: {
	readonly summary: string;
	readonly submitted: Extract<SubmitRunResult, { kind: "success" }>;
	readonly currentPr: CurrentPrVerificationResult;
	readonly submitCommandDisplay: string;
	readonly currentPrCommandDisplay: string;
}): SubmitFailureTranscript {
	return {
		phase: "post-submit verification",
		summary: options.summary,
		commands: [
			{
				commandDisplay: options.submitCommandDisplay,
				...submitFailureTranscriptFields(options.submitted.output),
			},
			{
				commandDisplay: options.currentPrCommandDisplay,
				...submitFailureTranscriptFields(options.currentPr.output),
			},
		],
	};
}

function submitFailureTranscriptFields(
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
