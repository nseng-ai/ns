import { spawnSync } from "node:child_process";

import { formatErrorMessage } from "@asdl/core/primitives";

import type { InteractiveClaudeInvocation, InteractiveClaudeRunResult } from "./interactive-claude.ts";

export function runInteractiveClaudeWithSpawnSync(invocation: InteractiveClaudeInvocation): InteractiveClaudeRunResult {
	const ignoreSigint = (): void => {};
	process.on("SIGINT", ignoreSigint);
	try {
		process.stdout.write("\x1b[2J\x1b[H");
		const args = invocation.name === undefined ? [invocation.prompt] : ["--name", invocation.name, invocation.prompt];
		const result = spawnSync("claude", args, {
			cwd: invocation.cwd,
			stdio: "inherit",
			env: invocation.env,
		});
		if (result.error !== undefined) {
			return { type: "spawn-failed", message: formatErrorMessage(result.error) };
		}
		return { type: "exited", code: result.status, signal: result.signal };
	} finally {
		process.removeListener("SIGINT", ignoreSigint);
	}
}
