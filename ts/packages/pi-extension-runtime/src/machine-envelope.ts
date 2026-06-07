import { tailText, type TailTextOptions } from "./command-runtime.ts";
import { formatErrorMessage, isRecord } from "./cmux/primitives.ts";

export interface MachineEnvelopeParseOptions {
	label: string;
	stdoutTail?: TailTextOptions | false;
}

export interface MachineEnvelopeDataParseValid {
	type: "valid";
	data: Record<string, unknown>;
}

export interface MachineEnvelopeDataParseInvalid {
	type: "invalid";
	message: string;
}

export type MachineEnvelopeDataParseResult = MachineEnvelopeDataParseValid | MachineEnvelopeDataParseInvalid;

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
		const statusText = envelopeStatusText(parsed);
		const suffix = statusText === undefined ? "" : `: ${statusText}`;
		return invalidMachineEnvelope(stdout, options, `expected envelope exit_code 0, got exit_code ${envelopeExitCode}${suffix}`);
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
	const lines = [`Malformed ${options.label}: ${reason}.`];
	if (options.stdoutTail !== undefined && options.stdoutTail !== false) {
		lines.push("", "stdout tail:", tailText(stdout, options.stdoutTail));
	}
	return { type: "invalid", message: lines.join("\n") };
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
