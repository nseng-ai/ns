import type { GitGateway } from "@nseng-ai/capability-kit/git";
import type { CommandContext } from "./runtime-types.ts";

export async function currentBranch(
	git: Pick<GitGateway, "currentBranch">,
	ctx: Pick<CommandContext, "cwd">,
	action: "pick up" | "list" | "create",
): Promise<string> {
	const branch = await git.currentBranch({ cwd: ctx.cwd });
	if (branch.type === "failure") {
		throw new Error(branch.error.message);
	}
	if (branch.type === "detached") {
		const recovery =
			action === "list" ? "pass --branch <branch> or --all" : "pass --branch <branch>";
		throw new Error(`Cannot ${action} handoffs in detached HEAD; ${recovery}.`);
	}
	return branch.branch;
}
