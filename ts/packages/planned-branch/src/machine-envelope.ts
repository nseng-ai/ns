import { formatErrorMessage, isRecord } from "@asdl/core/primitives";
import { tailText, type TailTextOptions } from "@asdl/plans";

export interface MachineEnvelopeParseOptions {
	label: string;
	stdoutTail?: TailTextOptions | false;
}

export function parseMachineEnvelopeData(
	stdout: string,
	options: MachineEnvelopeParseOptions,
): Record<string, unknown> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(stdout);
	} catch (error) {
		throw malformedEnvelope(stdout, options, `invalid JSON: ${formatErrorMessage(error)}`);
	}

	if (!isRecord(parsed)) {
		throw malformedEnvelope(stdout, options, "expected an envelope object");
	}

	const envelopeExitCode = parsed.exit_code;
	if (typeof envelopeExitCode !== "number" || !Number.isFinite(envelopeExitCode)) {
		throw malformedEnvelope(stdout, options, "expected numeric exit_code 0");
	}

	if (envelopeExitCode !== 0) {
		const statusText = envelopeStatusText(parsed);
		const suffix = statusText === undefined ? "" : `: ${statusText}`;
		throw malformedEnvelope(stdout, options, `expected envelope exit_code 0, got exit_code ${envelopeExitCode}${suffix}`);
	}

	const data = parsed.data;
	if (!isRecord(data)) {
		throw malformedEnvelope(stdout, options, "expected a data object");
	}

	return data;
}

function malformedEnvelope(stdout: string, options: MachineEnvelopeParseOptions, reason: string): Error {
	const lines = [`Malformed ${options.label}: ${reason}.`];
	if (options.stdoutTail !== undefined && options.stdoutTail !== false) {
		lines.push("", "stdout tail:", tailText(stdout, options.stdoutTail));
	}
	return new Error(lines.join("\n"));
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
