import type { CommandRunner, ExecResult } from "@nseng-ai/foundation/command";
import { commandFailureReason, commandSucceeded, formatCommand } from "@nseng-ai/foundation/exec";
import type { GitGateway } from "@nseng-ai/foundation/git";
import { runGitHubCliAsExecResult } from "@nseng-ai/extension-kit/github/cli";
import { withTemporaryFile } from "@nseng-ai/extension-kit/temp-files";
import { z } from "zod";

import type {
	BranchSubmitError,
	BranchSubmitPullRequest,
	BranchSubmitPullRequestGateway,
	BranchSubmitRepositoryGateway,
	BranchSubmitResult,
} from "./branch-submit.ts";

const READ_TIMEOUT_MS = 60_000;
const PUSH_TIMEOUT_MS = 120_000;
const PR_FIELDS = "number,url,title,body,headRefName,baseRefName,headRefOid";
const prSchema = z.object({
	number: z.number().int().positive(),
	url: z.url(),
	title: z.string(),
	body: z.string().nullable(),
	headRefName: z.string().min(1),
	baseRefName: z.string().min(1),
	headRefOid: z.string().min(1),
});
const prListSchema = z.array(z.object({ number: z.number().int().positive(), url: z.url() }));

export class RealBranchSubmitRepositoryGateway implements BranchSubmitRepositoryGateway {
	private readonly runner: CommandRunner;
	private readonly gitDiscovery: Pick<GitGateway, "currentBranch" | "cachedOriginHeadBranch">;

	constructor(
		runner: CommandRunner,
		gitDiscovery: Pick<GitGateway, "currentBranch" | "cachedOriginHeadBranch">,
	) {
		this.runner = runner;
		this.gitDiscovery = gitDiscovery;
	}

	async readFacts(input: { cwd: string }) {
		const branch = await currentBranchResult(this.gitDiscovery, input.cwd);
		if (!branch.ok) return branch;
		const trunk = await cachedTrunkResult(this.gitDiscovery, input.cwd);
		if (!trunk.ok) return trunk;
		const head = await this.git(
			input.cwd,
			["rev-parse", "HEAD"],
			"branch-submit-head-failed",
			"Could not resolve current HEAD.",
		);
		if (!head.ok) return head;
		const headOid = head.value.stdout.trim();
		if (headOid === "") {
			return failure({
				code: "branch-submit-facts-empty",
				message: "Git returned incomplete branch, trunk, or HEAD facts.",
			});
		}
		const currentBranch = branch.value;
		const trunkBranch = trunk.value;
		const commits = await this.git(
			input.cwd,
			["log", "--format=%s", `${trunkBranch}..${headOid}`],
			"branch-submit-commits-failed",
			`Could not read commits in ${trunkBranch}..${headOid}.`,
		);
		if (!commits.ok) return commits;
		const diff = await this.git(
			input.cwd,
			["diff", `${trunkBranch}...${headOid}`, "--no-ext-diff"],
			"branch-submit-diff-failed",
			`Could not read diff for ${trunkBranch}...${headOid}.`,
		);
		if (!diff.ok) return diff;
		return success({
			branch: currentBranch,
			trunk: trunkBranch,
			headOid,
			commitHeadlines: commits.value.stdout
				.split("\n")
				.map((line) => line.trim())
				.filter((line) => line !== ""),
			diff: diff.value.stdout,
		});
	}

	async pushExact(input: { cwd: string; branch: string; headOid: string }) {
		const refspec = `${input.headOid}:refs/heads/${input.branch}`;
		const result = await this.runner("git", ["push", "origin", refspec], {
			cwd: input.cwd,
			timeout: PUSH_TIMEOUT_MS,
		});
		const checkedResult = checked({
			result,
			command: "git",
			args: ["push", "origin", refspec],
			code: "branch-submit-push-failed",
			message: `Could not push ${input.branch}@${input.headOid}.`,
		});
		return checkedResult.ok ? success(undefined) : checkedResult;
	}

	private async git(
		cwd: string,
		args: readonly string[],
		code: string,
		message: string,
	): Promise<BranchSubmitResult<ExecResult>> {
		const result = await this.runner("git", args, { cwd, timeout: READ_TIMEOUT_MS });
		return checked({ result, command: "git", args, code, message });
	}
}

export class RealBranchSubmitPullRequestGateway implements BranchSubmitPullRequestGateway {
	private readonly runner: CommandRunner;

	constructor(runner: CommandRunner) {
		this.runner = runner;
	}

	async findOpenByHead(input: { cwd: string; branch: string }) {
		const args = [
			"pr",
			"list",
			"--head",
			input.branch,
			"--state",
			"open",
			"--limit",
			"2",
			"--json",
			"number,url",
		];
		const run = await this.gh(
			input.cwd,
			args,
			"branch-submit-pr-lookup-failed",
			`Could not query open PRs for ${input.branch}.`,
		);
		if (!run.ok) return run;
		const parsed = parseJson(
			run.value.stdout,
			prListSchema,
			"branch-submit-pr-lookup-parse-failed",
			`Open PR lookup for ${input.branch} returned malformed JSON.`,
		);
		if (!parsed.ok) return parsed;
		if (parsed.value.length === 0) return success({ type: "missing" as const });
		if (parsed.value.length > 1)
			return success({ type: "ambiguous" as const, candidates: parsed.value });
		const candidate = parsed.value[0];
		if (candidate === undefined) throw new Error("PR lookup candidate unexpectedly missing.");
		const read = await this.read({ cwd: input.cwd, number: candidate.number });
		return read.ok ? success({ type: "found" as const, pullRequest: read.value }) : read;
	}

	async create(input: { cwd: string; head: string; base: string; title: string; body: string }) {
		return await withTemporaryFile(
			{ prefix: "ns-flow-branch-submit-", filename: "body.md", contents: `${input.body}\n` },
			async (path) => {
				const args = [
					"pr",
					"create",
					"--head",
					input.head,
					"--base",
					input.base,
					"--title",
					input.title,
					"--body-file",
					path,
				];
				const run = await this.gh(
					input.cwd,
					args,
					"branch-submit-pr-create-failed",
					`Could not create a PR for ${input.head}.`,
				);
				if (!run.ok) return run;
				const match = run.value.stdout.match(
					/https:\/\/github\.com\/[^\s]+\/pull\/(?<number>\d+)/u,
				);
				const number = Number(match?.groups?.number);
				if (!Number.isSafeInteger(number) || number <= 0 || match?.[0] === undefined)
					return failure({
						code: "branch-submit-pr-create-parse-failed",
						message: "GitHub PR creation did not return a recognizable PR URL.",
					});
				return success({ number, url: match[0] });
			},
		);
	}

	async read(input: { cwd: string; number: number }) {
		const args = ["pr", "view", String(input.number), "--json", PR_FIELDS];
		const run = await this.gh(
			input.cwd,
			args,
			"branch-submit-pr-read-failed",
			`Could not read PR #${input.number}.`,
		);
		if (!run.ok) return run;
		const parsed = parseJson(
			run.value.stdout,
			prSchema,
			"branch-submit-pr-read-parse-failed",
			`PR #${input.number} returned malformed JSON.`,
		);
		if (!parsed.ok) return parsed;
		return success(toPullRequest(parsed.value));
	}

	async edit(input: { cwd: string; number: number; title: string; body: string }) {
		return await withTemporaryFile(
			{ prefix: "ns-flow-branch-submit-", filename: "body.md", contents: `${input.body}\n` },
			async (path) => {
				const args = [
					"pr",
					"edit",
					String(input.number),
					"--title",
					input.title,
					"--body-file",
					path,
				];
				const run = await this.gh(
					input.cwd,
					args,
					"branch-submit-pr-edit-failed",
					`Could not replace metadata for PR #${input.number}.`,
				);
				return run.ok ? success(undefined) : run;
			},
		);
	}

	private async gh(
		cwd: string,
		args: readonly string[],
		code: string,
		message: string,
	): Promise<BranchSubmitResult<ExecResult>> {
		const result = await runGitHubCliAsExecResult({
			runner: this.runner,
			args,
			cwd,
			timeoutMs: READ_TIMEOUT_MS,
		});
		return checked({ result, command: "gh", args, code, message });
	}
}

async function currentBranchResult(
	git: Pick<GitGateway, "currentBranch">,
	cwd: string,
): Promise<BranchSubmitResult<string>> {
	const result = await git.currentBranch({ cwd });
	switch (result.type) {
		case "branch":
			return success(result.branch);
		case "detached":
			return failure({
				code: "branch-submit-current-branch-failed",
				message: "Could not resolve a current branch; detached HEAD cannot be submitted.",
			});
		case "failure":
			return failure({
				code: "branch-submit-current-branch-failed",
				message: `Could not resolve a current branch; detached HEAD cannot be submitted. ${result.error.message}`,
				...(result.error.displayCommand === undefined
					? {}
					: { displayCommand: result.error.displayCommand }),
			});
	}
}

async function cachedTrunkResult(
	git: Pick<GitGateway, "cachedOriginHeadBranch">,
	cwd: string,
): Promise<BranchSubmitResult<string>> {
	const result = await git.cachedOriginHeadBranch({ cwd });
	switch (result.type) {
		case "found":
			return success(result.value);
		case "missing":
			return failure({
				code: "branch-submit-trunk-failed",
				message: "Could not resolve trunk from cached refs/remotes/origin/HEAD.",
			});
		case "error":
			return failure({
				code: "branch-submit-trunk-failed",
				message: `Could not resolve trunk from cached refs/remotes/origin/HEAD. ${result.error.message}`,
				...(result.error.displayCommand === undefined
					? {}
					: { displayCommand: result.error.displayCommand }),
			});
	}
}

function toPullRequest(value: z.infer<typeof prSchema>): BranchSubmitPullRequest {
	return {
		number: value.number,
		url: value.url,
		title: value.title,
		body: value.body ?? "",
		headRefName: value.headRefName,
		baseRefName: value.baseRefName,
		headOid: value.headRefOid,
	};
}

function parseJson<T>(
	text: string,
	schema: z.ZodType<T>,
	code: string,
	message: string,
): BranchSubmitResult<T> {
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch {
		return failure({ code, message });
	}
	const parsed = schema.safeParse(value);
	return parsed.success ? success(parsed.data) : failure({ code, message });
}

function checked(options: {
	result: ExecResult;
	command: string;
	args: readonly string[];
	code: string;
	message: string;
}): BranchSubmitResult<ExecResult> {
	if (commandSucceeded(options.result)) return success(options.result);
	return failure({
		code: options.code,
		message: `${options.message} ${commandFailureReason(options.result)}`,
		displayCommand: formatCommand(options.command, options.args),
	});
}

function success<T>(value: T): BranchSubmitResult<T> {
	return { ok: true, value };
}
function failure(error: BranchSubmitError): { ok: false; error: BranchSubmitError } {
	return { ok: false, error };
}
