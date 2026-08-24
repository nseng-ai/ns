import { dirname } from "node:path";

import { detectGitOperationInProgressAt } from "@nseng-ai/foundation/git";
import {
	commandSucceeded,
	formatCommand,
	type CommandExecApi,
	type ExecResult,
} from "@nseng-ai/foundation/exec";
import { z } from "zod";

import type {
	GsAutobranchCheckpointGateway,
	GsAutobranchGatewayResult,
	GsAutobranchGitFacts,
	GsAutobranchGitGateway,
	GsAutobranchProviderGateway,
	GsAutobranchProviderView,
} from "./autobranch.ts";

const providerViewSchema = z.strictObject({
	trunk: z.string().min(1),
	currentBranch: z.string().min(1),
	branches: z.array(
		z.looseObject({ name: z.string().min(1), base: z.string().min(1), isCurrent: z.boolean() }),
	),
});
const DIAGNOSTIC_LIMIT = 1_100;
const UNTRACKED_DIAGNOSTIC = /^✗ current branch ".+" is not part of a stack$/u;
export const GS_AUTOBRANCH_COMMAND_ENV = {
	GH_PROMPT_DISABLED: "1",
	GIT_TERMINAL_PROMPT: "0",
	GIT_EDITOR: "true",
	GIT_SEQUENCE_EDITOR: "true",
} as const;

export class RealGsAutobranchGitGateway implements GsAutobranchGitGateway {
	private readonly commands: CommandExecApi;
	private readonly cwd: string;
	constructor(commands: CommandExecApi, cwd: string) {
		this.commands = commands;
		this.cwd = cwd;
	}
	async inspect(
		child: string | null,
		source?: string,
	): Promise<GsAutobranchGatewayResult<GsAutobranchGitFacts>> {
		const [root, providerPath, branch, head, originHead, status, diff] = await Promise.all([
			this.git(["rev-parse", "--show-toplevel"]),
			this.git(["rev-parse", "--path-format=absolute", "--git-path", "gh-stack"]),
			this.git(["symbolic-ref", "--quiet", "--short", "HEAD"]),
			this.git(["rev-parse", "--verify", "HEAD"]),
			this.git(["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]),
			this.git(["status", "--porcelain=v1", "-z", "--untracked-files=all"]),
			this.git(["diff", "HEAD", "--no-ext-diff"]),
		]);
		for (const required of [root, providerPath, status, diff])
			if (!commandSucceeded(required)) return failed(required);
		const trunk = commandSucceeded(originHead)
			? originHead.stdout.trim().replace(/^origin\//u, "") || null
			: null;
		const [trunkRef, childRef, sourceRef] = await Promise.all([
			trunk === null
				? Promise.resolve(null)
				: this.git(["rev-parse", "--verify", `refs/heads/${trunk}`]),
			child === null
				? Promise.resolve(null)
				: this.git(["rev-parse", "--verify", `refs/heads/${child}`]),
			source === undefined
				? Promise.resolve(null)
				: this.git(["rev-parse", "--verify", `refs/heads/${source}`]),
		]);
		const entries = status.stdout.split("\0").filter(Boolean);
		const staged = entries.filter((entry) => entry[0] !== " " && entry[0] !== "?").length;
		const unstaged = entries.filter((entry) => entry[1] !== " " && entry[0] !== "?").length;
		const untracked = entries.filter((entry) => entry.startsWith("??")).length;
		return {
			ok: true,
			value: {
				root: root.stdout.trim(),
				providerWorktreeGitDir: dirname(providerPath.stdout.trim()),
				branch: commandSucceeded(branch) ? branch.stdout.trim() || null : null,
				headSha: commandSucceeded(head) ? head.stdout.trim() || null : null,
				trunk,
				trunkSha: trunkRef !== null && commandSucceeded(trunkRef) ? trunkRef.stdout.trim() : null,
				operation: detectGitOperationInProgressAt(root.stdout.trim())?.operation ?? "none",
				status: status.stdout,
				diff: diff.stdout,
				dirty: { staged, unstaged, untracked, total: entries.length },
				clean: entries.length === 0,
				childSha: childRef !== null && commandSucceeded(childRef) ? childRef.stdout.trim() : null,
				sourceRefSha:
					sourceRef !== null && commandSucceeded(sourceRef) ? sourceRef.stdout.trim() : null,
			},
		};
	}
	async validateChild(child: string): Promise<GsAutobranchGatewayResult<boolean>> {
		const valid = await this.git(["check-ref-format", "--branch", child]);
		if (valid.type !== "exited") return failed(valid);
		if (valid.code !== 0) return { ok: true, value: false };
		const present = await this.git(["show-ref", "--verify", "--quiet", `refs/heads/${child}`]);
		if (present.type !== "exited") return failed(present);
		if (present.code === 0) return { ok: true, value: false };
		return present.code === 1 ? { ok: true, value: true } : failed(present);
	}
	async createAndSwitchChild(child: string): Promise<GsAutobranchGatewayResult<null>> {
		const result = await this.git(["switch", "-c", child]);
		return commandSucceeded(result) ? { ok: true, value: null } : failed(result);
	}
	private git(args: string[]): Promise<ExecResult> {
		return this.commands.exec("git", args, { cwd: this.cwd });
	}
}

export class RealGsAutobranchProviderGateway implements GsAutobranchProviderGateway {
	private readonly commands: CommandExecApi;
	private readonly cwd: string;
	constructor(commands: CommandExecApi, cwd: string) {
		this.commands = commands;
		this.cwd = cwd;
	}
	async readVersion(): Promise<GsAutobranchGatewayResult<string>> {
		const args = ["stack", "--version"];
		const result = await this.run(args);
		if (!commandSucceeded(result)) return failed(result, args);
		const match = /^gh stack version (\S+)$/u.exec(result.stdout.trim());
		return match?.[1] === undefined
			? { ok: false, message: "gh stack --version returned unsupported output." }
			: { ok: true, value: match[1] };
	}
	async view(): Promise<GsAutobranchGatewayResult<GsAutobranchProviderView>> {
		const args = ["stack", "view", "--json"];
		const result = await this.run(args);
		if (!commandSucceeded(result)) {
			const diagnostic = result.stderr.trim() || result.stdout.trim();
			return UNTRACKED_DIAGNOSTIC.test(diagnostic)
				? { ok: false, message: bound(diagnostic), reason: "untracked" }
				: failed(result, args);
		}
		let decoded: unknown;
		try {
			decoded = JSON.parse(result.stdout);
		} catch {
			return { ok: false, message: "gh stack view --json returned malformed JSON." };
		}
		const parsed = providerViewSchema.safeParse(decoded);
		return parsed.success
			? { ok: true, value: parsed.data }
			: { ok: false, message: "gh stack view --json returned an unsupported shape." };
	}
	async init(child: string): Promise<GsAutobranchGatewayResult<null>> {
		return this.effect(["stack", "init", child]);
	}
	async add(child: string): Promise<GsAutobranchGatewayResult<null>> {
		return this.effect(["stack", "add", child]);
	}
	private async effect(args: string[]): Promise<GsAutobranchGatewayResult<null>> {
		const result = await this.run(args);
		return commandSucceeded(result) ? { ok: true, value: null } : failed(result, args);
	}
	private run(args: string[]): Promise<ExecResult> {
		return this.commands.exec("gh", args, { cwd: this.cwd, env: GS_AUTOBRANCH_COMMAND_ENV });
	}
}

export class RealGsAutobranchCheckpointGateway implements GsAutobranchCheckpointGateway {
	private readonly commitPrepared: (
		message: string,
	) => Promise<{ summary: string } | { error: string }>;
	constructor(
		commitPrepared: (message: string) => Promise<{ summary: string } | { error: string }>,
	) {
		this.commitPrepared = commitPrepared;
	}
	async commit(message: string): Promise<GsAutobranchGatewayResult<string>> {
		const result = await this.commitPrepared(message);
		return "summary" in result
			? { ok: true, value: result.summary }
			: { ok: false, message: result.error };
	}
}

function failed<T>(result: ExecResult, args?: readonly string[]): GsAutobranchGatewayResult<T> {
	const command = args === undefined ? "Git command" : formatCommand("gh", args);
	return {
		ok: false,
		message: bound(
			`${command} failed: ${result.stderr.trim() || result.stdout.trim() || result.type}`,
		),
		reason: "command-failed",
	};
}

function bound(value: string): string {
	return value.length <= DIAGNOSTIC_LIMIT
		? value
		: `${value.slice(0, DIAGNOSTIC_LIMIT - 20)}… [diagnostic bound]`;
}
