import type { ExecResult } from "@asdl/pi-extension-runtime/command-runtime";
import type { NotifyLevel } from "./types.ts";

export interface LandStackFailureOptions {
	level?: NotifyLevel;
	commandDisplay?: string;
	result?: ExecResult;
	failedBranch?: string;
	failedPr?: number;
	suggestedAction?: string;
}

export interface LandStackFailure {
	type: "land_stack_failure";
	level: NotifyLevel;
	message: string;
	commandDisplay: string | undefined;
	result: ExecResult | undefined;
	failedBranch: string | undefined;
	failedPr: number | undefined;
	suggestedAction: string | undefined;
}

export type LandStackResult<T> = { type: "success"; value: T } | { type: "failure"; failure: LandStackFailure };

export type LandStackOutcome = LandStackResult<void>;

export function landStackFailure(message: string, options: LandStackFailureOptions = {}): LandStackFailure {
	return {
		type: "land_stack_failure",
		level: options.level ?? "error",
		message,
		commandDisplay: options.commandDisplay,
		result: options.result,
		failedBranch: options.failedBranch,
		failedPr: options.failedPr,
		suggestedAction: options.suggestedAction,
	};
}

export function success<T>(value: T): LandStackResult<T> {
	return { type: "success", value };
}

export function failure<T = never>(landStackFailure: LandStackFailure): LandStackResult<T> {
	return { type: "failure", failure: landStackFailure };
}

export function completed(): LandStackOutcome {
	return success(undefined);
}

export function isFailure<T>(result: LandStackResult<T>): result is Extract<LandStackResult<T>, { type: "failure" }> {
	return result.type === "failure";
}

export function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export function emptyResult(): ExecResult {
	return { stdout: "", stderr: "", code: 1, killed: false };
}
