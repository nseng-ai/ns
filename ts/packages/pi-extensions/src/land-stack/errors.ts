import type { ExecResult } from "../command-runtime.ts";
import type { NotifyLevel } from "./types.ts";

export interface LandStackErrorOptions {
	level?: NotifyLevel;
	commandDisplay?: string;
	result?: ExecResult;
	failedBranch?: string;
	failedPr?: number;
	suggestedAction?: string;
}

export class LandStackError extends Error {
	readonly level: NotifyLevel;
	readonly commandDisplay: string | undefined;
	readonly result: ExecResult | undefined;
	readonly failedBranch: string | undefined;
	readonly failedPr: number | undefined;
	readonly suggestedAction: string | undefined;

	constructor(message: string, options: LandStackErrorOptions = {}) {
		super(message);
		this.name = "LandStackError";
		this.level = options.level ?? "error";
		this.commandDisplay = options.commandDisplay;
		this.result = options.result;
		this.failedBranch = options.failedBranch;
		this.failedPr = options.failedPr;
		this.suggestedAction = options.suggestedAction;
	}
}

export function fail(message: string, options?: LandStackErrorOptions): never {
	throw new LandStackError(message, options);
}

export function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export function emptyResult(): ExecResult {
	return { stdout: "", stderr: "", code: 1, killed: false };
}
