import { type ExecResult, formatCommand } from "@ns/core/command";
import { GIT_TIMEOUT_MS } from "./command-constants.ts";
import { formatExecFailure, formatStartupFailure } from "./command-failure.ts";
import type { CommandContext, ExtensionAPI } from "./runtime-types.ts";

export async function currentBranch(
	pi: ExtensionAPI,
	ctx: Pick<CommandContext, "cwd">,
	action: "pick up" | "list" | "create",
): Promise<string> {
	const commandArgs = ["branch", "--show-current"];
	let result: ExecResult;
	try {
		result = await pi.exec("git", commandArgs, { cwd: ctx.cwd, timeout: GIT_TIMEOUT_MS });
	} catch (error) {
		throw new Error(formatStartupFailure(formatCommand("git", commandArgs), error));
	}
	if (result.code !== 0 || result.killed) {
		throw new Error(formatExecFailure(formatCommand("git", commandArgs), result));
	}

	const branch = result.stdout.trim();
	if (branch.length === 0) {
		const recovery =
			action === "list" ? "pass --branch <branch> or --all" : "pass --branch <branch>";
		throw new Error(`Cannot ${action} handoffs in detached HEAD; ${recovery}.`);
	}
	return branch;
}
