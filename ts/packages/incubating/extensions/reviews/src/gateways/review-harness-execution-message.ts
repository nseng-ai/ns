import type { ExecResult } from "@nseng-ai/foundation/command";

export interface ReviewHarnessExecutionMessageOptions {
	readonly harnessLabel: string;
	readonly useStdoutFallback: boolean;
}

export function reviewHarnessExecutionMessage(
	result: ExecResult,
	options: ReviewHarnessExecutionMessageOptions,
): string {
	const stderr = result.stderr.trim();
	if (stderr !== "") return stderr;
	if (options.useStdoutFallback) {
		const stdout = result.stdout.trimEnd();
		if (stdout !== "") {
			const lines = stdout.split("\n");
			return lines[lines.length - 1] ?? stdout;
		}
	}
	const harnessLabel = options.harnessLabel;
	switch (result.type) {
		case "spawn-failed":
			return result.error;
		case "cancelled":
			return `${harnessLabel} execution was cancelled.`;
		case "timed-out":
			return `${harnessLabel} execution timed out.`;
		case "exited":
			return result.signal === null
				? `${harnessLabel} exited with status ${result.code}.`
				: `${harnessLabel} exited after signal ${result.signal} (status ${result.code ?? "unknown"}).`;
	}
}
