import { tailText, type TailTextOptions } from "@sdl/core/exec";
import { formatErrorMessage } from "@sdl/core/primitives";
import { isRecord } from "../cmux/primitives.ts";

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

export type MachineEnvelopeDataWithFailureDataResult =
	| { type: "valid"; data: Record<string, unknown> }
	| { type: "invalid"; message: string };

export interface ParseMachineEnvelopeDataWithFailureDataOptions extends MachineEnvelopeParseOptions {
	shouldAllowFailureData?: boolean | undefined;
}

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

	const envelopeExitCode = parsed.exitCode;
	if (typeof envelopeExitCode !== "number" || !Number.isFinite(envelopeExitCode)) {
		return invalidMachineEnvelope(stdout, options, "expected numeric exitCode 0");
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

export function parseMachineEnvelopeDataWithFailureData(
	stdout: string,
	options: ParseMachineEnvelopeDataWithFailureDataOptions,
): MachineEnvelopeDataWithFailureDataResult {
	const parsed = parseMachineEnvelopeData(stdout, options);
	if (parsed.type === "valid") return parsed;
	if (options.shouldAllowFailureData === true) {
		const failureData = failureEnvelopeData(stdout);
		if (failureData !== undefined) return { type: "valid", data: failureData };
	}
	return { type: "invalid", message: parsed.message };
}

function failureEnvelopeData(stdout: string): Record<string, unknown> | undefined {
	let parsed: unknown;
	try {
		parsed = JSON.parse(stdout);
	} catch {
		// Malformed JSON means stdout is not a Clinkr failure envelope; report the original parse error.
		return undefined;
	}
	if (!isRecord(parsed) || parsed.exitCode !== 1 || !isRecord(parsed.data)) return undefined;
	return parsed.data;
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
		typeof envelope.errorType === "string" && envelope.errorType.length > 0
			? envelope.errorType
			: undefined;
	const cliMessage = envelopeStatusText(envelope);
	const details = [
		`exitCode ${exitCode}`,
		...(errorType === undefined ? [] : [`errorType ${errorType}`]),
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
