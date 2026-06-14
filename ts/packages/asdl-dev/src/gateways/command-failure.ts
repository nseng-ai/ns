import { tailText, type ExecResult } from "@asdl/core/exec";

import type { ErrorInfo } from "../result.ts";

export function commandFailure(input: {
	command: string;
	args: readonly string[];
	result: ExecResult;
	code: string;
	message: string;
}): ErrorInfo | undefined {
	if (input.result.code === 0 && !input.result.killed) {
		return undefined;
	}
	return {
		code: input.code,
		message: input.message,
		details: {
			command: input.command,
			args: [...input.args],
			exit_code: input.result.code,
			...(input.result.killed ? { killed: true } : {}),
			...(input.result.stdout === "" ? {} : { stdout: tailText(input.result.stdout, { maxChars: 4000 }) }),
			...(input.result.stderr === "" ? {} : { stderr: tailText(input.result.stderr, { maxChars: 4000 }) }),
		},
	};
}
