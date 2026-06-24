import { commandSucceeded, type ExecResult, type SdlExtensionApi } from "@sdl/sdl/sdk";

export type FlowGitPorcelainStatusResult =
	| { ok: true; clean: boolean; stdout: string; result: ExecResult }
	| { ok: false; result: ExecResult };

export async function execFlowGit(
	ctx: SdlExtensionApi,
	args: readonly string[],
	timeoutMs?: number,
): Promise<ExecResult> {
	if (timeoutMs === undefined) {
		return await ctx.exec("git", [...args]);
	}
	return await ctx.exec("git", [...args], { timeoutMs });
}

export async function readFlowGitPorcelainStatus(
	ctx: SdlExtensionApi,
	timeoutMs?: number,
): Promise<FlowGitPorcelainStatusResult> {
	const result = await execFlowGit(ctx, ["status", "--porcelain"], timeoutMs);
	if (!commandSucceeded(result)) {
		return { ok: false, result };
	}

	const stdout = result.stdout;
	return { ok: true, clean: stdout.trim().length === 0, stdout, result };
}
