import { detectGitOperationInProgressAt } from "@nseng-ai/foundation/git";
import { commandSucceeded, formatCommand, type CommandExecApi } from "@nseng-ai/foundation/exec";

import type { GsGitInspectionResult, GsRestackGitGateway, GsRestackGitState } from "./git.ts";

export class RealGsRestackGitGateway implements GsRestackGitGateway {
	private readonly commands: CommandExecApi;
	private readonly cwd: string;

	constructor(commands: CommandExecApi, cwd: string) {
		this.commands = commands;
		this.cwd = cwd;
	}

	async inspect(): Promise<GsGitInspectionResult> {
		const branch = await this.commands.exec("git", ["symbolic-ref", "--quiet", "--short", "HEAD"], {
			cwd: this.cwd,
		});
		const status = await this.commands.exec("git", ["status", "--porcelain=v1", "-z"], {
			cwd: this.cwd,
		});
		if (!commandSucceeded(status)) {
			return {
				ok: false,
				failure: {
					command: formatCommand("git", ["status", "--porcelain=v1", "-z"]),
					message: status.stderr.trim() || status.stdout.trim() || status.type,
				},
			};
		}
		const entries = status.stdout.split("\0").filter((entry) => entry.length > 0);
		const state: GsRestackGitState = {
			branch: commandSucceeded(branch) ? branch.stdout.trim() || null : null,
			operation: detectGitOperationInProgressAt(this.cwd)?.operation ?? "none",
			clean: entries.length === 0,
			unmergedPaths: entries.filter(isUnmerged).map((entry) => entry.slice(3)),
			hasStagedChanges: entries.some(
				(entry) => entry[0] !== " " && entry[0] !== "?" && !isUnmerged(entry),
			),
		};
		return { ok: true, state };
	}
}

function isUnmerged(entry: string): boolean {
	return ["DD", "AU", "UD", "UA", "DU", "AA", "UU"].includes(entry.slice(0, 2));
}
