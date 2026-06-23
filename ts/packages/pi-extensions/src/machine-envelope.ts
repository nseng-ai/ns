import {
	parseMachineEnvelopeData,
	type MachineEnvelopeParseOptions,
} from "@sdl/pi-extension-runtime/machine-envelope";

import { isRecord } from "./cmux/primitives.ts";

export { parseMachineEnvelopeData } from "@sdl/pi-extension-runtime/machine-envelope";
export type {
	MachineEnvelopeDataParseFailure,
	MachineEnvelopeDataParseInvalid,
	MachineEnvelopeDataParseResult,
	MachineEnvelopeDataParseValid,
	MachineEnvelopeParseOptions,
} from "@sdl/pi-extension-runtime/machine-envelope";

export type MachineEnvelopeDataWithFailureDataResult =
	| { type: "valid"; data: Record<string, unknown> }
	| { type: "invalid"; message: string };

export interface ParseMachineEnvelopeDataWithFailureDataOptions extends MachineEnvelopeParseOptions {
	shouldAllowFailureData?: boolean | undefined;
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
	if (!isRecord(parsed) || parsed.exit_code !== 1 || !isRecord(parsed.data)) return undefined;
	return parsed.data;
}
