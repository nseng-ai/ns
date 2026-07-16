import type {
	CurrentPrVerificationResult,
	SubmitCommandOutput,
	SubmitCommandResult,
	SubmitFailurePresentation,
	SubmitFailureTranscript,
	SubmitFailureTranscriptCommand,
	SubmitRunResult,
} from "./submit-contracts.ts";

export const POST_METADATA_GRAPHITE_FAILURE_ADVISORY =
	"Local PR metadata commit messages were prepared before submit; verify the metadata after resolving the Graphite failure.";

export interface SubmitFailureResultOptions {
	failurePresentation: SubmitFailurePresentation;
	rawFailureTranscript?: SubmitFailureTranscript;
}

export function submitFailureResult(
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

export function deterministicSubmitCommandFailure(input: {
	phase: string;
	commandDisplay: string;
	output: SubmitCommandOutput;
	stderr: string;
	exitCode?: number;
}): SubmitCommandResult {
	return submitFailureResult(
		input.exitCode ?? normalizedSubmitFailureExitCode(input.output),
		input.stderr,
		{
			failurePresentation: "deterministic",
			rawFailureTranscript: submitCommandFailureTranscript(
				input.phase,
				input.commandDisplay,
				input.output,
				input.stderr,
			),
		},
	);
}

export function unknownSubmitCommandFailure(input: {
	phase: string;
	commandDisplay: string;
	output: SubmitCommandOutput;
	stderr: string;
}): SubmitCommandResult {
	return submitFailureResult(normalizedSubmitFailureExitCode(input.output), input.stderr, {
		failurePresentation: "unknown",
		rawFailureTranscript: submitCommandFailureTranscript(
			input.phase,
			input.commandDisplay,
			input.output,
		),
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

export function submitCommandFailureTranscript(
	phase: string,
	commandDisplay: string,
	output: SubmitCommandOutput,
	summary?: string,
): SubmitFailureTranscript {
	return {
		phase,
		...(summary === undefined || summary.trim() === "" ? {} : { summary: summary.trimEnd() }),
		commands: [{ commandDisplay, ...submitFailureTranscriptFields(output) }],
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

export function postSubmitFailureTranscript(
	summary: string,
	submitted: Extract<SubmitRunResult, { kind: "success" }>,
	currentPr: CurrentPrVerificationResult,
	submitCommandDisplay: string,
	currentPrCommandDisplay: string,
): SubmitFailureTranscript {
	return {
		phase: "post-submit verification",
		summary,
		commands: [
			{
				commandDisplay: submitCommandDisplay,
				...submitFailureTranscriptFields(submitted.output),
			},
			{
				commandDisplay: currentPrCommandDisplay,
				...submitFailureTranscriptFields(currentPr.output),
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
