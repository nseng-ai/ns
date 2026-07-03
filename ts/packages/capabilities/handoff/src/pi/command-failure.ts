import {
	type ExecResult,
	formatCommandFailure,
	formatCommandStartupFailure,
} from "@ns/core/command";

export function formatExecFailure(commandDisplay: string, result: ExecResult): string {
	return formatCommandFailure("command failed", commandDisplay, result);
}

export function formatStartupFailure(commandDisplay: string, error: unknown): string {
	return formatCommandStartupFailure("command failed", commandDisplay, error);
}
