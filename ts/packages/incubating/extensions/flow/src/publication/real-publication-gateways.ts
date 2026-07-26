import { withTemporaryFile } from "@nseng-ai/extension-kit/temp-files";
import { runGitHubCliAsExecResult } from "@nseng-ai/extension-kit/github/cli";
import {
	commandFailureReason,
	commandSucceeded,
	execApiToCommandRunner,
	formatCommand,
	type CommandExecApi,
	type ExecResult,
} from "@nseng-ai/foundation/exec";
import { z } from "zod";

import {
	createFlowBranchPublicationClientFromGateways,
	type FlowBranchPublicationClient,
	type FlowBranchPublicationContext,
	type FlowPublicationError,
	type FlowPublicationGatewayResult,
	type FlowPublicationPullRequest,
	type FlowPublicationPullRequestGateway,
	type FlowPublicationRepositoryGateway,
} from "./branch-publication.ts";

const READ_TIMEOUT_MS = 60_000;
const PUSH_TIMEOUT_MS = 120_000;
const EDIT_TIMEOUT_MS = 60_000;
const PR_FIELDS = "number,url,body,headRefName,headRefOid";

const pullRequestSchema = z.object({
	number: z.number().int().positive(),
	url: z.string().url(),
	body: z.string().nullable(),
	headRefName: z.string().min(1),
	headRefOid: z.string().min(1),
});

export interface CreateFlowBranchPublicationClientOptions {
	cwd: string;
	commands: CommandExecApi;
}

export function createFlowBranchPublicationClient(
	options: CreateFlowBranchPublicationClientOptions,
): FlowBranchPublicationClient {
	return createFlowBranchPublicationClientFromGateways(createRealFlowPublicationGateways(options));
}

export function createRealFlowPublicationGateways(
	options: CreateFlowBranchPublicationClientOptions,
): FlowBranchPublicationContext {
	return {
		repository: new RealFlowPublicationRepositoryGateway(options),
		pullRequests: new RealFlowPublicationPullRequestGateway(options),
	};
}

class RealFlowPublicationRepositoryGateway implements FlowPublicationRepositoryGateway {
	private readonly cwd: string;
	private readonly commands: CommandExecApi;

	constructor(options: CreateFlowBranchPublicationClientOptions) {
		this.cwd = options.cwd;
		this.commands = options.commands;
	}

	async readCurrentBranch() {
		const branchArgs = ["symbolic-ref", "--quiet", "--short", "HEAD"];
		const branch = await this.commands.exec("git", branchArgs, {
			cwd: this.cwd,
			timeout: READ_TIMEOUT_MS,
		});
		if (!commandSucceeded(branch)) {
			return failure("flow-publication-branch-read-failed", "Could not resolve a current branch.", {
				command: "git",
				args: branchArgs,
				result: branch,
			});
		}
		const headArgs = ["rev-parse", "HEAD"];
		const head = await this.commands.exec("git", headArgs, {
			cwd: this.cwd,
			timeout: READ_TIMEOUT_MS,
		});
		if (!commandSucceeded(head)) {
			return failure("flow-publication-head-read-failed", "Could not resolve current HEAD.", {
				command: "git",
				args: headArgs,
				result: head,
			});
		}
		return success({ branch: branch.stdout.trim(), headOid: head.stdout.trim() });
	}

	async publishBranch(input: { branch: string; expectedHeadOid: string }) {
		const ref = `refs/heads/${input.branch}`;
		const args = ["push", "origin", `${input.expectedHeadOid}:${ref}`];
		const result = await this.commands.exec("git", args, {
			cwd: this.cwd,
			timeout: PUSH_TIMEOUT_MS,
		});
		if (!commandSucceeded(result)) {
			return failure("flow-publication-push-failed", "The bound branch push failed.", {
				command: "git",
				args,
				result,
			});
		}
		return success(undefined);
	}
}

class RealFlowPublicationPullRequestGateway implements FlowPublicationPullRequestGateway {
	private readonly cwd: string;
	private readonly commands: CommandExecApi;

	constructor(options: CreateFlowBranchPublicationClientOptions) {
		this.cwd = options.cwd;
		this.commands = options.commands;
	}

	async readCurrentBranchPullRequest(): Promise<
		FlowPublicationGatewayResult<FlowPublicationPullRequest>
	> {
		return await this.read(["pr", "view", "--json", PR_FIELDS]);
	}

	async readPullRequest(
		number: number,
	): Promise<FlowPublicationGatewayResult<FlowPublicationPullRequest>> {
		return await this.read(["pr", "view", String(number), "--json", PR_FIELDS]);
	}

	async replacePullRequestBody(input: { number: number; body: string }) {
		return await withTemporaryFile(
			{ prefix: "ns-flow-objective-runner-", filename: "body.md", contents: input.body },
			async (bodyPath) => {
				const args = ["pr", "edit", String(input.number), "--body-file", bodyPath];
				const result = await runGitHubCliAsExecResult({
					runner: execApiToCommandRunner(this.commands),
					args,
					cwd: this.cwd,
					timeoutMs: EDIT_TIMEOUT_MS,
				});
				if (!commandSucceeded(result)) {
					return failure(
						"flow-publication-pr-edit-failed",
						`Could not replace the body of PR #${input.number}.`,
						{ command: "gh", args, result },
					);
				}
				return success(undefined);
			},
		);
	}

	private async read(
		args: string[],
	): Promise<FlowPublicationGatewayResult<FlowPublicationPullRequest>> {
		const result = await runGitHubCliAsExecResult({
			runner: execApiToCommandRunner(this.commands),
			args,
			cwd: this.cwd,
			timeoutMs: READ_TIMEOUT_MS,
		});
		if (!commandSucceeded(result)) {
			return failure("flow-publication-pr-read-failed", "Could not read the bound PR.", {
				command: "gh",
				args,
				result,
			});
		}
		const parsed = parsePullRequest(result.stdout);
		if (!parsed.ok) return parsed;
		return success(parsed.value);
	}
}

function parsePullRequest(
	stdout: string,
): FlowPublicationGatewayResult<FlowPublicationPullRequest> {
	let json: unknown;
	try {
		json = JSON.parse(stdout);
	} catch {
		return failure("flow-publication-pr-parse-failed", "GitHub PR output was not valid JSON.");
	}
	const parsed = pullRequestSchema.safeParse(json);
	if (!parsed.success) {
		return failure(
			"flow-publication-pr-parse-failed",
			"GitHub PR output was missing publication target fields.",
		);
	}
	return success({
		number: parsed.data.number,
		url: parsed.data.url,
		body: parsed.data.body ?? "",
		headRefName: parsed.data.headRefName,
		headOid: parsed.data.headRefOid,
	});
}

function success<T>(value: T): FlowPublicationGatewayResult<T> {
	return { ok: true, value };
}

function failure(
	code: string,
	message: string,
	command?: { command: string; args: readonly string[]; result: ExecResult },
): { ok: false; error: FlowPublicationError } {
	if (command === undefined) return { ok: false, error: { code, message } };
	return {
		ok: false,
		error: {
			code,
			message: `${message} ${commandFailureReason(command.result)}`,
			displayCommand: formatCommand(command.command, command.args),
		},
	};
}
