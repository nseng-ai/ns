import { tailText, type ExecResult } from "@asdl/core/exec";

import type { ErrorInfo } from "../result.ts";

const STDERR_DETAIL_LIMIT_CHARS = 1_200;

export interface CommandFailureOptions {
	command: string;
	args: readonly string[];
	result: ExecResult;
	code: string;
	message: string;
}

export function commandFailure(options: CommandFailureOptions): ErrorInfo | undefined {
	const { command, args, result, code, message } = options;
	if (result.code === 0 && !result.killed) {
		return undefined;
	}

	const details: Record<string, unknown> = {
		command,
		args: [...args],
		exit_code: result.code,
	};
	if (result.startupError !== undefined) {
		details.startup_error = result.startupError;
	}
	const stderr = tailText(result.stderr.trim(), { maxChars: STDERR_DETAIL_LIMIT_CHARS });
	if (stderr !== "") {
		details.stderr = stderr;
	}

	return { code, message, details };
}
