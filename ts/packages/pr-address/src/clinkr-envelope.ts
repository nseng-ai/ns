export type ClinkrExit<T = unknown> = ClinkrOk<T> | ClinkrNegative<T> | ClinkrFailure;

export interface ClinkrOk<T> {
	type: "ok";
	data: T;
}

export interface ClinkrNegative<T> {
	type: "negative";
	data: T | undefined;
	message: string;
}

export interface ClinkrFailure {
	type: "failure";
	errorType: string;
	message: string;
}

export interface MachineEnvelope {
	exit_code: 0 | 1 | 2;
	data?: unknown;
	message?: string;
	error_type?: string;
}

export interface EmitClinkrExitOptions {
	format: "human" | "json";
	stdout: (text: string) => void;
	stderr: (text: string) => void;
}

export function clinkrOk<T>(data: T): ClinkrExit<T> {
	return { type: "ok", data };
}

export function clinkrNegative<T>(data: T | undefined, message: string): ClinkrExit<T> {
	return { type: "negative", data, message };
}

export function clinkrFailure(errorType: string, message: string): ClinkrExit<never> {
	return { type: "failure", errorType, message };
}

export function exitCodeForClinkrExit(exit: ClinkrExit): 0 | 1 | 2 {
	switch (exit.type) {
		case "ok":
			return 0;
		case "negative":
			return 1;
		case "failure":
			return 2;
	}
}

export function toMachineEnvelope(exit: ClinkrExit): MachineEnvelope {
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

export function emitClinkrExit(exit: ClinkrExit, options: EmitClinkrExitOptions): number {
	if (options.format === "json") {
		options.stdout(`${JSON.stringify(toMachineEnvelope(exit), null, 2)}\n`);
		return exitCodeForClinkrExit(exit);
	}

	switch (exit.type) {
		case "ok":
			options.stdout(`${JSON.stringify(exit.data, null, 2)}\n`);
			return 0;
		case "negative":
			options.stderr(`${exit.message}\n`);
			return 1;
		case "failure":
			options.stderr(`error: ${exit.message}\n`);
			return 2;
	}
}
