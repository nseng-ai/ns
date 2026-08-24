import { realpathSync } from "node:fs";

import {
	detectGitOperationInProgressAt,
	parseGitWorktreePorcelain,
} from "@nseng-ai/foundation/git";
import {
	commandSucceeded,
	formatCommand,
	type CommandExecApi,
	type ExecResult,
} from "@nseng-ai/foundation/exec";

import type {
	GsBranchRef,
	GsGitResult,
	GsGitState,
	GsRestackGitGateway,
	GsWorktreeOccupancy,
} from "./restack-git.ts";

export class RealGsRestackGitGateway implements GsRestackGitGateway {
	private readonly commands: CommandExecApi;
	private readonly cwd: string;

	constructor(commands: CommandExecApi, cwd: string) {
		this.commands = commands;
		this.cwd = cwd;
	}

	async readState(): Promise<GsGitResult<GsGitState>> {
		const [head, branch, status] = await Promise.all([
			this.git(["rev-parse", "HEAD"]),
			this.git(["symbolic-ref", "--quiet", "--short", "HEAD"], true),
			this.git(["status", "--porcelain=v1"]),
		]);
		if (!head.ok) return head;
		if (!status.ok) return status;
		const active = detectGitOperationInProgressAt(this.cwd)?.operation ?? "none";
		const lines = status.value.stdout.split(/\r?\n/u).filter((line) => line !== "");
		const unmergedPaths = lines.filter(isUnmergedStatus).map((line) => line.slice(3));
		return {
			ok: true,
			value: {
				checkout: {
					branch: branch.ok ? branch.value.stdout.trim() || null : null,
					head: head.value.stdout.trim(),
				},
				operation: active,
				clean: lines.length === 0,
				unmergedPaths,
				hasStagedChanges: lines.some(
					(line) => line[0] !== " " && line[0] !== "?" && !isUnmergedStatus(line),
				),
			},
		};
	}

	async readBranchRefs(branches: readonly string[]): Promise<GsGitResult<readonly GsBranchRef[]>> {
		const refs: GsBranchRef[] = [];
		for (const branch of branches) {
			const result = await this.git(["rev-parse", "--verify", `refs/heads/${branch}`]);
			if (!result.ok) return result;
			refs.push({ name: branch, sha: result.value.stdout.trim() });
		}
		return { ok: true, value: refs };
	}

	async readWorktreeOccupancy(): Promise<GsGitResult<readonly GsWorktreeOccupancy[]>> {
		const result = await this.git(["worktree", "list", "--porcelain"]);
		if (!result.ok) return result;
		return {
			ok: true,
			value: parseGitWorktreePorcelain(result.value.stdout).flatMap((entry) =>
				entry.branch === null || sameRealPath(entry.path, this.cwd)
					? []
					: [{ branch: entry.branch, path: entry.path }],
			),
		};
	}

	async isAncestor(ancestor: string, descendant: string): Promise<GsGitResult<boolean>> {
		const result = await this.commands.exec(
			"git",
			["merge-base", "--is-ancestor", ancestor, descendant],
			{ cwd: this.cwd },
		);
		if (result.type === "exited" && result.code === 1) return { ok: true, value: false };
		if (!commandSucceeded(result))
			return failure(["merge-base", "--is-ancestor", ancestor, descendant], result);
		return { ok: true, value: true };
	}

	private async git(args: string[], allowFailure = false): Promise<GsGitResult<ExecResult>> {
		const result = await this.commands.exec("git", args, { cwd: this.cwd });
		if (commandSucceeded(result)) return { ok: true, value: result };
		if (allowFailure) return failure(args, result);
		return failure(args, result);
	}
}

function sameRealPath(left: string, right: string): boolean {
	try {
		return realpathSync(left) === realpathSync(right);
	} catch {
		return left === right;
	}
}

function isUnmergedStatus(line: string): boolean {
	return ["DD", "AU", "UD", "UA", "DU", "AA", "UU"].includes(line.slice(0, 2));
}

function failure(args: readonly string[], result: ExecResult): GsGitResult<never> {
	return {
		ok: false,
		error: {
			command: formatCommand("git", args),
			message: result.stderr.trim() || result.stdout.trim() || result.type,
		},
	};
}
