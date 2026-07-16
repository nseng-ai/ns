import { commandOperations } from "../phase-stream/matrix-progress-core.ts";
import type { NsProgressPhaseEvent } from "@nseng-ai/sdk";

import {
	formatPrewrittenMetadataAdvisory,
	formatPreflightFailureOutput,
	formatReadinessRecheckFailureOutput,
	formatRestackConfirmationPrompt,
	formatRestackConflictOutput,
	formatRestackDeclinedOutput,
	formatRestackFailureOutput,
	formatRestackRequiredOutput,
} from "./submit-format.ts";
import { formatSubmitPreflightFailureCause } from "./submit-failure-catalog.ts";
import type { PrewrittenPrMetadata } from "./pr-description-orchestration.ts";
import type {
	RunSubmitCommandOptions,
	SubmitCommandOutput,
	SubmitCommandParams,
	SubmitCommandResult,
	SubmitFailureTranscript,
	SubmitPreflightResult,
} from "./submit.ts";
import {
	prepareSubmitTransport,
	type SubmitTransportObservation,
	type SubmitTransportObservationSink,
	type SubmitTransportReady,
} from "./submit-transport.ts";

const RESTACK_COMMAND_DISPLAY = "gt restack --downstack --no-interactive";
const CURRENT_PR_COMMAND_DISPLAY = "gh pr view --json number,url";

type RestackDecision = "run" | "declined" | "unavailable";

export type OrdinarySubmitTransportPreparation =
	| { kind: "ready"; transport: SubmitTransportReady }
	| { kind: "failure"; failure: SubmitCommandResult };

export type OrdinarySubmitEligibility =
	| { kind: "eligible" }
	| { kind: "failure"; failure: SubmitCommandResult };

export async function checkOrdinarySubmitEligibility(
	options: OrdinarySubmitTransportOptions,
): Promise<OrdinarySubmitEligibility> {
	const preparation = await prepareOrdinarySubmitTransport({ ...options, purpose: "eligibility" });
	return preparation.kind === "failure" ? preparation : { kind: "eligible" };
}

interface OrdinarySubmitTransportOptions {
	command: Pick<
		RunSubmitCommandOptions,
		"gateway" | "restack" | "force" | "confirmRestack" | "progress"
	>;
	params: SubmitCommandParams;
	submitCommandDisplay: string;
	submitDryRunCommandDisplay: string;
	prewrittenMetadata?: readonly PrewrittenPrMetadata[];
}

export async function prepareOrdinarySubmitTransport(
	options: OrdinarySubmitTransportOptions & { purpose?: "eligibility" | "final-readiness" },
): Promise<OrdinarySubmitTransportPreparation> {
	const command = options.command;
	emitPhase(command, { type: "phase-started", phaseKey: "preflight" });
	const readiness = await prepareSubmitTransport({
		gateway: command.gateway,
		params: options.params,
		observationSink: ordinarySubmitTransportObservationSink(command, options),
	});
	if (readiness.kind === "failed") {
		emitPhase(command, {
			type: "phase-failed",
			phaseKey: "preflight",
			detail: "submit readiness failed",
		});
		return {
			kind: "failure",
			failure: readinessFailure({
				result: readiness.outcome,
				phase: "preflight",
				submitDryRunCommandDisplay: options.submitDryRunCommandDisplay,
				...(options.prewrittenMetadata === undefined
					? {}
					: { prewrittenMetadata: options.prewrittenMetadata }),
			}),
		};
	}
	if (readiness.kind === "ready") {
		emitPhase(command, {
			type: "phase-done",
			phaseKey: "preflight",
			detail:
				options.purpose === "eligibility" ? "eligible for metadata preparation" : "ready to submit",
		});
		emitPhase(command, { type: "phase-done", phaseKey: "restack", detail: "not required" });
		return { kind: "ready", transport: readiness };
	}

	emitPhase(command, { type: "phase-done", phaseKey: "preflight", detail: "restack required" });
	emitPhase(command, {
		type: "phase-progress",
		phaseKey: "preflight",
		label: "Graphite requires a restack before submit",
	});
	const restackDecision = await shouldRunRestack(command, readiness.outcome.output, options);
	if (restackDecision === "unavailable") {
		emitPhase(command, {
			type: "phase-failed",
			phaseKey: "restack",
			detail: "restack required but disabled",
		});
		return {
			kind: "failure",
			failure: deterministicFailure({
				phase: "preflight",
				commandDisplay: options.submitDryRunCommandDisplay,
				output: readiness.outcome.output,
				stderr: withMetadataAdvisory(formatRestackRequiredOutput(), options.prewrittenMetadata),
				exitCode: 1,
			}),
		};
	}
	if (restackDecision === "declined") {
		emitPhase(command, { type: "phase-failed", phaseKey: "restack", detail: "restack declined" });
		return {
			kind: "failure",
			failure: deterministicFailure({
				phase: "preflight",
				commandDisplay: options.submitDryRunCommandDisplay,
				output: readiness.outcome.output,
				stderr: withMetadataAdvisory(formatRestackDeclinedOutput(), options.prewrittenMetadata),
				exitCode: 1,
			}),
		};
	}

	emitPhase(command, { type: "phase-started", phaseKey: "restack" });
	const restacked = await readiness.restackAndRecheck({
		restack: options.params,
		readinessRecheck: options.params,
	});
	if (restacked.kind === "ready") {
		emitPhase(command, { type: "phase-done", phaseKey: "restack", detail: "restack complete" });
		return { kind: "ready", transport: restacked };
	}

	if (restacked.stage === "restack") {
		emitPhase(command, { type: "phase-failed", phaseKey: "restack", detail: "restack failed" });
		if (restacked.outcome.kind === "conflict") {
			return {
				kind: "failure",
				failure: deterministicFailure({
					phase: "restack",
					commandDisplay: RESTACK_COMMAND_DISPLAY,
					output: restacked.outcome.output,
					stderr: withMetadataAdvisory(
						formatRestackConflictOutput(restacked.outcome.conflictedFiles),
						options.prewrittenMetadata,
					),
					exitCode: 1,
				}),
			};
		}
		return {
			kind: "failure",
			failure: unknownCommandFailure({
				phase: "restack",
				commandDisplay: RESTACK_COMMAND_DISPLAY,
				output: restacked.outcome.output,
				stderr: withMetadataAdvisory(
					formatRestackFailureOutput(restacked.outcome.output),
					options.prewrittenMetadata,
				),
			}),
		};
	}

	emitPhase(command, {
		type: "phase-failed",
		phaseKey: "restack",
		detail: "readiness recheck failed",
	});
	return {
		kind: "failure",
		failure: readinessFailure({
			result: restacked.outcome,
			phase: "readiness recheck",
			submitDryRunCommandDisplay: options.submitDryRunCommandDisplay,
			...(options.prewrittenMetadata === undefined
				? {}
				: { prewrittenMetadata: options.prewrittenMetadata }),
			isRecheck: true,
		}),
	};
}

function readinessFailure(input: {
	result: SubmitPreflightResult;
	phase: string;
	submitDryRunCommandDisplay: string;
	prewrittenMetadata?: readonly PrewrittenPrMetadata[];
	isRecheck?: boolean;
}): SubmitCommandResult {
	if (input.result.kind === "failed" && input.result.cause !== undefined) {
		const message = formatSubmitPreflightFailureCause(input.result.cause, input.result.output);
		return deterministicFailure({
			phase: input.phase,
			commandDisplay: input.submitDryRunCommandDisplay,
			output: input.result.output,
			stderr: withMetadataAdvisory(message, input.prewrittenMetadata),
		});
	}
	if (input.isRecheck === true) {
		return deterministicFailure({
			phase: input.phase,
			commandDisplay: input.submitDryRunCommandDisplay,
			output: input.result.output,
			stderr: withMetadataAdvisory(
				formatReadinessRecheckFailureOutput(input.submitDryRunCommandDisplay),
				input.prewrittenMetadata,
			),
		});
	}
	return unknownCommandFailure({
		phase: input.phase,
		commandDisplay: input.submitDryRunCommandDisplay,
		output: input.result.output,
		stderr: withMetadataAdvisory(
			formatPreflightFailureOutput(input.result.output, input.submitDryRunCommandDisplay),
			input.prewrittenMetadata,
		),
	});
}

async function shouldRunRestack(
	options: Pick<RunSubmitCommandOptions, "restack" | "force" | "confirmRestack">,
	output: SubmitCommandOutput,
	displays: { submitCommandDisplay: string; submitDryRunCommandDisplay: string },
): Promise<RestackDecision> {
	if (options.restack) return "run";
	if (options.confirmRestack === undefined) return "unavailable";
	const confirmed = await options.confirmRestack(formatRestackConfirmationPrompt(output, displays));
	return confirmed ? "run" : "declined";
}

function withMetadataAdvisory(
	message: string,
	prewrittenMetadata: readonly PrewrittenPrMetadata[] | undefined,
): string {
	const advisory = formatPrewrittenMetadataAdvisory(
		prewrittenMetadata ?? [],
		"Local PR metadata commit messages were prepared before submit; verify the metadata after resolving the Graphite failure.",
	);
	return [message, ...(advisory.length === 0 ? [] : ["", ...advisory])].join("\n");
}

function ordinarySubmitTransportObservationSink(
	command: Pick<RunSubmitCommandOptions, "progress">,
	displays: { submitCommandDisplay: string; submitDryRunCommandDisplay: string },
): SubmitTransportObservationSink {
	return (observation) => {
		if (observation.type === "stage-completed") {
			command.progress.matrix?.setActiveOperations([]);
			return;
		}
		command.progress.matrix?.setActiveOperations([
			...commandOperations(submitTransportCommandDisplays(observation, displays)),
		]);
		if (observation.stage === "restack") {
			emitPhase(command, {
				type: "phase-progress",
				phaseKey: "preflight",
				label: "running gt restack",
			});
		}
	};
}

function submitTransportCommandDisplays(
	observation: Extract<SubmitTransportObservation, { type: "stage-started" }>,
	displays: { submitCommandDisplay: string; submitDryRunCommandDisplay: string },
): readonly string[] {
	switch (observation.stage) {
		case "readiness":
		case "readiness-recheck":
			return [displays.submitDryRunCommandDisplay];
		case "restack":
			return [RESTACK_COMMAND_DISPLAY];
		case "submit":
			return [displays.submitCommandDisplay];
		case "verification":
			return [CURRENT_PR_COMMAND_DISPLAY];
	}
}

function emitPhase(
	options: Pick<RunSubmitCommandOptions, "progress">,
	event: NsProgressPhaseEvent,
): void {
	options.progress.phase(event);
}

function deterministicFailure(input: {
	phase: string;
	commandDisplay: string;
	output: SubmitCommandOutput;
	stderr: string;
	exitCode?: number;
}): SubmitCommandResult {
	return commandFailure(input, "deterministic", input.exitCode);
}

function unknownCommandFailure(input: {
	phase: string;
	commandDisplay: string;
	output: SubmitCommandOutput;
	stderr: string;
}): SubmitCommandResult {
	return commandFailure(input, "unknown");
}

function commandFailure(
	input: { phase: string; commandDisplay: string; output: SubmitCommandOutput; stderr: string },
	failurePresentation: "deterministic" | "unknown",
	exitCode?: number,
): SubmitCommandResult {
	return {
		exitCode: exitCode ?? normalizedFailureExitCode(input.output),
		stdout: "",
		stderr: input.stderr.endsWith("\n") ? input.stderr : `${input.stderr}\n`,
		failurePresentation,
		rawFailureTranscript: commandFailureTranscript(
			input.phase,
			input.commandDisplay,
			input.output,
			failurePresentation === "deterministic" ? input.stderr : undefined,
		),
	};
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
				termination: output.type,
				exitCode: output.type === "spawn-failed" ? null : output.code,
				...(output.type === "spawn-failed" ? { error: output.error } : { signal: output.signal }),
			},
		],
	};
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
