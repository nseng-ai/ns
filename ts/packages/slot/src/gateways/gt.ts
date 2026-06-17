import { join } from "node:path";

import { NodeCommandExecApi, type CommandExecApi } from "@asdl/core/exec";

import type { SlotCliContext } from "../context.ts";
import { readBranchGraphFromMetadataDb, readStackFromMetadataDb } from "../gt/metadata-reader.ts";
import type { BranchMetadataGraph, GtCommandFailure, NoParent, StackInfo, UntrackedBranch } from "../gt/types.ts";

const GT_TIMEOUT_MS = 10_000;
const UNTRACKED_PHRASES = ["untracked branch"] as const;

export interface SlotGtGateway {
	parentOf(cwd: string): Promise<{ type: "branch"; branch: string } | NoParent | UntrackedBranch | { type: "failure"; failure: GtCommandFailure }>;
	childrenOf(cwd: string): Promise<{ type: "children"; children: readonly string[] } | UntrackedBranch | { type: "failure"; failure: GtCommandFailure }>;
	trunk(cwd: string): Promise<{ type: "trunk"; branch: string } | { type: "failure"; failure: GtCommandFailure }>;
	stack(cwd: string): Promise<{ type: "stack"; stack: StackInfo } | UntrackedBranch | { type: "failure"; failure: GtCommandFailure }>;
	metadataGraph(cwd: string): Promise<{ type: "graph"; graph: BranchMetadataGraph } | { type: "failure"; failure: GtCommandFailure }>;
}

export class RealSlotGtGateway implements SlotGtGateway {
	private readonly env: NodeJS.ProcessEnv;
	private readonly execApi: CommandExecApi;
	private readonly git: SlotCliContext["git"];

	constructor(options: { env?: NodeJS.ProcessEnv | undefined; execApi?: CommandExecApi | undefined; git: SlotCliContext["git"] }) {
		this.env = options.env ?? process.env;
		this.execApi = options.execApi ?? new NodeCommandExecApi();
		this.git = options.git;
	}

	async parentOf(cwd: string): Promise<{ type: "branch"; branch: string } | NoParent | UntrackedBranch | { type: "failure"; failure: GtCommandFailure }> {
		const result = await this.gt(["parent", "--no-interactive"], cwd);
		if (!result.isOk) return this.failureOrUntracked(result);
		const branch = firstLine(result.stdout);
		return branch === null ? { type: "no_parent" } : { type: "branch", branch };
	}

	async childrenOf(cwd: string): Promise<{ type: "children"; children: readonly string[] } | UntrackedBranch | { type: "failure"; failure: GtCommandFailure }> {
		const result = await this.gt(["children", "--no-interactive"], cwd);
		if (!result.isOk) return this.failureOrUntracked(result);
		return { type: "children", children: lines(result.stdout) };
	}

	async trunk(cwd: string): Promise<{ type: "trunk"; branch: string } | { type: "failure"; failure: GtCommandFailure }> {
		const result = await this.gt(["trunk", "--no-interactive"], cwd);
		if (!result.isOk) return { type: "failure", failure: failureFromResult(result) };
		const branch = firstLine(result.stdout);
		if (branch === null) return { type: "failure", failure: { message: "gt trunk returned no branch", returncode: null } };
		return { type: "trunk", branch };
	}

	async stack(cwd: string): Promise<{ type: "stack"; stack: StackInfo } | UntrackedBranch | { type: "failure"; failure: GtCommandFailure }> {
		const current = await this.git.getCurrentBranch(cwd);
		if (current.type !== "branch") return { type: "failure", failure: { message: current.type === "detached" ? "HEAD is detached" : current.failure.message, returncode: null } };
		const db = await this.metadataDbPath(cwd);
		if (db.type === "failure") return db;
		const result = readStackFromMetadataDb(db.path, current.branch);
		if ("trunk" in result) return { type: "stack", stack: result };
		if ("returncode" in result) return { type: "failure", failure: result };
		return result;
	}

	async metadataGraph(cwd: string): Promise<{ type: "graph"; graph: BranchMetadataGraph } | { type: "failure"; failure: GtCommandFailure }> {
		const db = await this.metadataDbPath(cwd);
		if (db.type === "failure") return db;
		const result = readBranchGraphFromMetadataDb(db.path);
		if ("rows" in result) return { type: "graph", graph: result };
		return { type: "failure", failure: result };
	}

	private async metadataDbPath(cwd: string): Promise<{ type: "path"; path: string } | { type: "failure"; failure: GtCommandFailure }> {
		const commonDir = await this.git.getGitCommonDir(cwd);
		if (commonDir === null) return { type: "failure", failure: { message: "Could not resolve Git common dir for Graphite metadata.", returncode: null } };
		return { type: "path", path: join(commonDir, ".graphite_metadata.db") };
	}

	private failureOrUntracked(result: CommandResult): UntrackedBranch | { type: "failure"; failure: GtCommandFailure } {
		const text = `${result.stderr}\n${result.stdout}`.toLowerCase();
		if (UNTRACKED_PHRASES.some((phrase) => text.includes(phrase))) return { type: "untracked_branch", message: result.stderr.trim() || result.stdout.trim() || "current branch is not tracked by Graphite" };
		return { type: "failure", failure: failureFromResult(result) };
	}

	private async gt(args: readonly string[], cwd: string): Promise<CommandResult> {
		const result = await this.execApi.exec("gt", [...args], { cwd, env: this.env, timeout: GT_TIMEOUT_MS });
		return { isOk: result.code === 0 && !result.killed, stdout: result.stdout, stderr: result.stderr, code: result.code, killed: result.killed };
	}
}

interface CommandResult {
	isOk: boolean;
	stdout: string;
	stderr: string;
	code: number | null;
	killed: boolean;
}

export function getSlotGtGateway(ctx: SlotCliContext): SlotGtGateway {
	if (ctx.gt !== undefined) return ctx.gt;
	if (ctx.createGt !== undefined) return ctx.createGt();
	return new RealSlotGtGateway({ env: ctx.env, git: ctx.git });
}

function firstLine(stdout: string): string | null {
	return lines(stdout)[0] ?? null;
}

function lines(stdout: string): readonly string[] {
	return stdout.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
}

function failureFromResult(result: CommandResult): GtCommandFailure {
	const message = result.stderr.trim() || result.stdout.trim() || (result.killed ? "gt command was killed" : "gt command failed");
	return { message, returncode: result.code };
}
