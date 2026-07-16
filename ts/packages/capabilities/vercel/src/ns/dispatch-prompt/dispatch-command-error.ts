import type { ExecResult } from "@nseng-ai/foundation/command";

import type { DispatchGatewayError } from "../dispatch-client/contracts.ts";

export function dispatchCommandError(
	code: string,
	prefix: string,
	result: ExecResult,
): DispatchGatewayError {
	return { code, message: `${prefix}: ${firstErrorLine(result)}` };
}

export function firstErrorLine(result: ExecResult): string {
	const stderr = result.stderr.trim();
	const text = (stderr.length > 0 ? stderr : result.stdout.trim()).split("\n")[0] ?? "";
	if (text.length > 0) return text;
	if (result.type === "exited") return `exit code ${result.code ?? "unknown"}`;
	return result.type;
}
