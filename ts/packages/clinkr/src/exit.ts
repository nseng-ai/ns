import { z } from "zod";

export interface ClinkrOkExit<T> {
	type: "ok";
	data: T;
}

export interface ClinkrNegativeExit<T> {
	type: "negative";
	message: string;
	data?: T;
}

export interface ClinkrFailureExit {
	type: "failure";
	errorType: string;
	message: string;
}

export type ClinkrExit<T> = ClinkrOkExit<T> | ClinkrNegativeExit<T> | ClinkrFailureExit;

/**
 * The semantic machine envelope emitted under `--format json`, at exact parity
 * with Python clinkr's `ClinkrExit.to_envelope_dict`: keys are omitted when absent.
 * Process exit status may diverge in default shell-friendly negative mode.
 */
export interface MachineEnvelope {
	exit_code: 0 | 1 | 2;
	error_type?: string;
	message?: string;
	data?: unknown;
}

export interface ClinkrExitCodeOptions {
	shellExitCode?: boolean | undefined;
}

export const machineEnvelopeSchema = z.strictObject({
	exit_code: z.union([z.literal(0), z.literal(1), z.literal(2)]),
	error_type: z.string().optional(),
	message: z.string().optional(),
	data: z.unknown().optional(),
});

export function ok<T>(data: T): ClinkrOkExit<T> {
	return { type: "ok", data };
}

export function negative<T = never>(message: string, data?: T): ClinkrNegativeExit<T> {
	if (data === undefined) return { type: "negative", message };
	return { type: "negative", message, data };
}

export function failure(errorType: string, message: string): ClinkrFailureExit {
	return { type: "failure", errorType, message };
}

export function exitCodeForExit(exit: ClinkrExit<unknown>, options: ClinkrExitCodeOptions = {}): 0 | 1 | 2 {
	switch (exit.type) {
		case "ok":
			return 0;
		case "negative":
			return options.shellExitCode === true ? 1 : 0;
		case "failure":
			return 2;
	}
}

export function toMachineEnvelope(exit: ClinkrExit<unknown>): MachineEnvelope {
	// Object-literal key order matches Python's envelope insertion order
	// (exit_code, error_type, message, data) so serialized output is byte-identical.
	switch (exit.type) {
		case "ok":
			return { exit_code: 0, data: exit.data };
		case "negative": {
			const envelope: MachineEnvelope = { exit_code: 1, message: exit.message };
			if (exit.data !== undefined) envelope.data = exit.data;
			return envelope;
		}
		case "failure":
			return { exit_code: 2, error_type: exit.errorType, message: exit.message };
	}
}

const NON_ASCII_PATTERN = /[\u007f-\uffff]/g;

/**
 * Serialize JSON byte-for-byte like Python `json.dumps(value, indent=2)`,
 * including `ensure_ascii` escaping of non-ASCII characters.
 */
export function envelopeJsonText(value: unknown): string {
	const serialized = JSON.stringify(value, null, 2);
	if (serialized === undefined) return String(serialized);
	return serialized.replace(
		NON_ASCII_PATTERN,
		(character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
	);
}
