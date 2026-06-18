import { tailText, type TailTextOptions } from "@asdl/core/exec";
import { formatErrorMessage } from "@asdl/core/primitives";
import { isRecord } from "./cmux/primitives.ts";

export interface MachineEnvelopeParseOptions {
	label: string;
	stdoutTail?: TailTextOptions | false;
}

export interface MachineEnvelopeDataParseValid {
	type: "valid";
	data: Record<string, unknown>;
}

export interface MachineEnvelopeDataParseFailure {
	type: "failure";
	exitCode: number;
	errorType?: string;
	cliMessage?: string;
	message: string;
}

export interface MachineEnvelopeDataParseInvalid {
	type: "invalid";
	message: string;
}

export type MachineEnvelopeDataParseResult =
	| MachineEnvelopeDataParseValid
	| MachineEnvelopeDataParseFailure
	| MachineEnvelopeDataParseInvalid;

export function parseMachineEnvelopeData(
	stdout: string,
	options: MachineEnvelopeParseOptions,
): MachineEnvelopeDataParseResult {
	let parsed: unknown;
	try {
		parsed = JSON.parse(stdout);
	} catch (error) {
		return invalidMachineEnvelope(stdout, options, `invalid JSON: ${formatErrorMessage(error)}`);
	}

	if (!isRecord(parsed)) {
		return invalidMachineEnvelope(stdout, options, "expected an envelope object");
	}

	const envelopeExitCode = parsed.exit_code;
	if (typeof envelopeExitCode !== "number" || !Number.isFinite(envelopeExitCode)) {
		return invalidMachineEnvelope(stdout, options, "expected numeric exit_code 0");
	}

	if (envelopeExitCode !== 0) {
		return failureMachineEnvelope({
			stdout,
			options,
			envelope: parsed,
			exitCode: envelopeExitCode,
		});
	}

	const data = parsed.data;
	if (!isRecord(data)) {
		return invalidMachineEnvelope(stdout, options, "expected a data object");
	}

	return { type: "valid", data };
}

function invalidMachineEnvelope(
	stdout: string,
	options: MachineEnvelopeParseOptions,
	reason: string,
): MachineEnvelopeDataParseInvalid {
	return {
		type: "invalid",
		message: formatEnvelopeMessage(stdout, options, `Malformed ${options.label}: ${reason}.`),
	};
}

interface FailureMachineEnvelopeOptions {
	stdout: string;
	options: MachineEnvelopeParseOptions;
	envelope: Record<string, unknown>;
	exitCode: number;
}

function failureMachineEnvelope({
	stdout,
	options,
	envelope,
	exitCode,
}: FailureMachineEnvelopeOptions): MachineEnvelopeDataParseFailure {
	const errorType =
		typeof envelope.error_type === "string" && envelope.error_type.length > 0
			? envelope.error_type
			: undefined;
	const cliMessage = envelopeStatusText(envelope);
	const details = [
		`exit_code ${exitCode}`,
		...(errorType === undefined ? [] : [`error_type ${errorType}`]),
		...(cliMessage === undefined ? [] : [cliMessage]),
	];
	return {
		type: "failure",
		exitCode,
		...(errorType === undefined ? {} : { errorType }),
		...(cliMessage === undefined ? {} : { cliMessage }),
		message: formatEnvelopeMessage(
			stdout,
			options,
			`${options.label} reported failure: ${formatSentence(details.join(": "))}`,
		),
	};
}

function formatSentence(text: string): string {
	return /[.!?]$/.test(text) ? text : `${text}.`;
}

function formatEnvelopeMessage(
	stdout: string,
	options: MachineEnvelopeParseOptions,
	firstLine: string,
): string {
	const lines = [firstLine];
	if (options.stdoutTail !== undefined && options.stdoutTail !== false) {
		lines.push("", "stdout tail:", tailText(stdout, options.stdoutTail));
	}
	return lines.join("\n");
}

function envelopeStatusText(envelope: Record<string, unknown>): string | undefined {
	if (typeof envelope.message === "string" && envelope.message.length > 0) {
		return envelope.message;
	}
	if (typeof envelope.error === "string" && envelope.error.length > 0) {
		return envelope.error;
	}
	return undefined;
}
