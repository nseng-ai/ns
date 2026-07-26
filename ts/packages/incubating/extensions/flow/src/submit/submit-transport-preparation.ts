import { commandOperations } from "../phase-stream/matrix-progress-core.ts";
import type { NsProgressPhaseEvent } from "@nseng-ai/sdk";

import {
	formatPreflightFailureOutput,
	formatReadinessRecheckFailureOutput,
	formatRestackConfirmationPrompt,
	formatRestackConflictOutput,
	formatRestackDeclinedOutput,
	formatRestackFailureOutput,
	formatRestackRequiredOutput,
} from "./submit-format.ts";
import { formatSubmitPreflightFailureCause } from "./submit-failure-catalog.ts";
import type {
	SubmitCommandOutput,
	SubmitCommandParams,
	SubmitCommandResult,
	SubmitGateway,
	SubmitPreflightResult,
} from "./submit-contracts.ts";
import {
	deterministicSubmitCommandFailure,
	unknownSubmitCommandFailure,
} from "./submit-failure-result.ts";
import type { SubmitProgress } from "./submit-progress.ts";
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

interface OrdinarySubmitCommandContext {
	gateway: SubmitGateway;
	restack: boolean;
	force: boolean;
	confirmRestack?: (prompt: { title: string; message: string }) => Promise<boolean> | boolean;
	progress: SubmitProgress;
}

interface OrdinarySubmitTransportOptions {
	command: OrdinarySubmitCommandContext;
	params: SubmitCommandParams;
	submitCommandDisplay: string;
	submitDryRunCommandDisplay: string;
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
			failure: deterministicSubmitCommandFailure({
				phase: "preflight",
				commandDisplay: options.submitDryRunCommandDisplay,
				output: readiness.outcome.output,
				stderr: formatRestackRequiredOutput(),
				exitCode: 1,
			}),
		};
	}
	if (restackDecision === "declined") {
		emitPhase(command, { type: "phase-failed", phaseKey: "restack", detail: "restack declined" });
		return {
			kind: "failure",
			failure: deterministicSubmitCommandFailure({
				phase: "preflight",
				commandDisplay: options.submitDryRunCommandDisplay,
				output: readiness.outcome.output,
				stderr: formatRestackDeclinedOutput(),
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
				failure: deterministicSubmitCommandFailure({
					phase: "restack",
					commandDisplay: RESTACK_COMMAND_DISPLAY,
					output: restacked.outcome.output,
					stderr: formatRestackConflictOutput(restacked.outcome.conflictedFiles),
					exitCode: 1,
				}),
			};
		}
		return {
			kind: "failure",
			failure: unknownSubmitCommandFailure({
				phase: "restack",
				commandDisplay: RESTACK_COMMAND_DISPLAY,
				output: restacked.outcome.output,
				stderr: formatRestackFailureOutput(restacked.outcome.output),
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
			isRecheck: true,
		}),
	};
}

function readinessFailure(input: {
	result: SubmitPreflightResult;
	phase: string;
	submitDryRunCommandDisplay: string;
	isRecheck?: boolean;
}): SubmitCommandResult {
	if (input.result.kind === "failed" && input.result.cause !== undefined) {
		const message = formatSubmitPreflightFailureCause(input.result.cause, input.result.output);
		return deterministicSubmitCommandFailure({
			phase: input.phase,
			commandDisplay: input.submitDryRunCommandDisplay,
			output: input.result.output,
			stderr: message,
		});
	}
	if (input.isRecheck === true) {
		return deterministicSubmitCommandFailure({
			phase: input.phase,
			commandDisplay: input.submitDryRunCommandDisplay,
			output: input.result.output,
			stderr: formatReadinessRecheckFailureOutput(input.submitDryRunCommandDisplay),
		});
	}
	return unknownSubmitCommandFailure({
		phase: input.phase,
		commandDisplay: input.submitDryRunCommandDisplay,
		output: input.result.output,
		stderr: formatPreflightFailureOutput(input.result.output, input.submitDryRunCommandDisplay),
	});
}

async function shouldRunRestack(
	options: Pick<OrdinarySubmitCommandContext, "restack" | "force" | "confirmRestack">,
	output: SubmitCommandOutput,
	displays: { submitCommandDisplay: string; submitDryRunCommandDisplay: string },
): Promise<RestackDecision> {
	if (options.restack) return "run";
	if (options.confirmRestack === undefined) return "unavailable";
	const confirmed = await options.confirmRestack(formatRestackConfirmationPrompt(output, displays));
	return confirmed ? "run" : "declined";
}

function ordinarySubmitTransportObservationSink(
	command: Pick<OrdinarySubmitCommandContext, "progress">,
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
	options: Pick<OrdinarySubmitCommandContext, "progress">,
	event: NsProgressPhaseEvent,
): void {
	options.progress.phase(event);
}
