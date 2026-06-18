import { runCommand, type CommandRunner, type ExecResult } from "../exec.ts";
import { GITHUB_CLI_TIMEOUT_MS } from "../github-cli.ts";
import { isRecord } from "../primitives.ts";
import { withTemporaryFile } from "../temp-files.ts";

import { err, ok, type GatewayResult } from "./result.ts";
import { commandFailure } from "./command-failure.ts";

const PR_VIEW_FIELDS = "number,url,title,body,headRefName,baseRefName";
const VIEW_TIMEOUT_MS = GITHUB_CLI_TIMEOUT_MS;
const DIFF_TIMEOUT_MS = 60_000;
const PATCH_ID_TIMEOUT_MS = 60_000;
const EDIT_TIMEOUT_MS = 60_000;

export interface GithubPrDetails {
	number: number;
	url: string;
	title: string;
	body: string;
	headRefName: string;
	baseRefName: string;
}

export interface PrCommitMessage {
	headline: string;
	body?: string;
}

export interface StablePatchIdForPrResult {
	patchId: string;
	diff: string;
}

export interface GithubPrGateway {
	viewCurrentBranchPr(params: { cwd: string }): Promise<GatewayResult<GithubPrDetails>>;
	viewPr(params: { cwd: string; number: number }): Promise<GatewayResult<GithubPrDetails>>;
	getPrCommitMessages(params: { cwd: string; number: number }): Promise<GatewayResult<PrCommitMessage[]>>;
	getPrDiff(params: { cwd: string; number: number; baseRefName?: string; headRefName?: string }): Promise<GatewayResult<string>>;
	stablePatchIdForPr(params: { cwd: string; number: number }): Promise<GatewayResult<StablePatchIdForPrResult>>;
	editPr(params: { cwd: string; number: number; title: string; body: string }): Promise<GatewayResult<void>>;
}

export class RealGithubPrGateway implements GithubPrGateway {
	private readonly runner: CommandRunner;

	constructor(runner: CommandRunner = runCommand) {
		this.runner = runner;
	}

	async viewCurrentBranchPr(params: { cwd: string }): Promise<GatewayResult<GithubPrDetails>> {
		return this.viewPrWithArgs({ cwd: params.cwd, args: ["pr", "view", "--json", PR_VIEW_FIELDS] });
	}

	async viewPr(params: { cwd: string; number: number }): Promise<GatewayResult<GithubPrDetails>> {
		return this.viewPrWithArgs({ cwd: params.cwd, args: ["pr", "view", String(params.number), "--json", PR_VIEW_FIELDS] });
	}

	async getPrCommitMessages(params: { cwd: string; number: number }): Promise<GatewayResult<PrCommitMessage[]>> {
		const args = ["pr", "view", String(params.number), "--json", "commits"];
		const result = await this.runGh(args, params.cwd, VIEW_TIMEOUT_MS);
		const failure = commandFailure({
			command: "gh",
			args,
			result,
			code: "github_pr_commits_failed",
			message: `Could not read commit messages for PR #${params.number}.`,
		});
		if (failure !== undefined) return err(failure);

		const parsed = parseJson(result.stdout);
		if (!isRecord(parsed) || !Array.isArray(parsed.commits)) {
			return err({ code: "github_pr_commits_parse_failed", message: `GitHub commits output for PR #${params.number} had an unexpected shape.` });
		}

		const messages: PrCommitMessage[] = [];
		for (const commit of parsed.commits) {
			if (!isRecord(commit) || typeof commit.messageHeadline !== "string") continue;
			const message: PrCommitMessage = { headline: commit.messageHeadline };
			if (typeof commit.messageBody === "string" && commit.messageBody.trim() !== "") {
				message.body = commit.messageBody;
			}
			messages.push(message);
		}
		return ok(messages);
	}

	async getPrDiff(params: { cwd: string; number: number; baseRefName?: string; headRefName?: string }): Promise<GatewayResult<string>> {
		const args = ["pr", "diff", String(params.number)];
		const result = await this.runGh(args, params.cwd, DIFF_TIMEOUT_MS);
		const failure = commandFailure({
			command: "gh",
			args,
			result,
			code: "github_pr_diff_failed",
			message: `Could not read diff for PR #${params.number}.`,
		});
		if (failure === undefined) return ok(result.stdout);

		if (params.baseRefName !== undefined && params.headRefName !== undefined && isGithubDiffTooLarge(result)) {
			return await this.getLocalPrDiff(params);
		}
		return err(failure);
	}

	async stablePatchIdForPr(params: { cwd: string; number: number }): Promise<GatewayResult<StablePatchIdForPrResult>> {
		const diff = await this.getPrDiff(params);
		if (!diff.ok) return diff;

		const args = ["patch-id", "--stable"];
		const result = await this.runner("git", args, { cwd: params.cwd, timeout: PATCH_ID_TIMEOUT_MS, stdin: diff.value });
		const failure = commandFailure({
			command: "git",
			args,
			result,
			code: "git_patch_id_failed",
			message: `Could not compute stable patch id for PR #${params.number}.`,
		});
		if (failure !== undefined) return err(failure);

		const patchId = result.stdout.trim().split(/\s+/, 1)[0] ?? "";
		if (patchId === "") {
			return err({ code: "git_patch_id_parse_failed", message: `Stable patch-id output for PR #${params.number} was empty or malformed.` });
		}
		return ok({ patchId, diff: diff.value });
	}

	async editPr(params: { cwd: string; number: number; title: string; body: string }): Promise<GatewayResult<void>> {
		return await withTemporaryFile({ prefix: "asdl-dev-pr-body-", filename: "body.md", contents: `${params.body}\n` }, async (bodyPath) => {
			const args = ["pr", "edit", String(params.number), "--title", params.title, "--body-file", bodyPath];
			const result = await this.runGh(args, params.cwd, EDIT_TIMEOUT_MS);
			const failure = commandFailure({
				command: "gh",
				args,
				result,
				code: "github_pr_edit_failed",
				message: `Could not update PR #${params.number}.`,
			});
			if (failure !== undefined) return err(failure);
			return ok(undefined);
		});
	}

	private async viewPrWithArgs(params: { cwd: string; args: string[] }): Promise<GatewayResult<GithubPrDetails>> {
		const result = await this.runGh(params.args, params.cwd, VIEW_TIMEOUT_MS);
		const failure = commandFailure({
			command: "gh",
			args: params.args,
			result,
			code: "github_pr_view_failed",
			message: "Could not read GitHub PR details.",
		});
		if (failure !== undefined) return err(failure);

		const parsed = parseGithubPrDetails(result.stdout);
		if (!parsed.ok) return err(parsed.error);
		return ok(parsed.value);
	}

	private async getLocalPrDiff(params: { cwd: string; number: number; baseRefName?: string; headRefName?: string }): Promise<GatewayResult<string>> {
		const baseRefName = params.baseRefName;
		const headRefName = params.headRefName;
		if (baseRefName === undefined || headRefName === undefined) {
			return err({ code: "github_pr_diff_failed", message: `Could not read diff for PR #${params.number}.` });
		}

		const args = ["diff", `${baseRefName}...${headRefName}`];
		const result = await this.runner("git", args, { cwd: params.cwd, timeout: DIFF_TIMEOUT_MS });
		const failure = commandFailure({
			command: "git",
			args,
			result,
			code: "github_pr_local_diff_failed",
			message: `GitHub PR #${params.number} diff was too large for GitHub; could not read local diff for ${baseRefName}...${headRefName}.`,
		});
		if (failure !== undefined) return err(failure);
		return ok(result.stdout);
	}

	private async runGh(args: readonly string[], cwd: string, timeoutMs: number): Promise<ExecResult> {
		return this.runner("gh", args, { cwd, timeout: timeoutMs });
	}

}

function isGithubDiffTooLarge(result: ExecResult): boolean {
	const output = `${result.stderr}\n${result.stdout}`;
	return result.code === 1 && /diff exceeded the maximum number of lines|PullRequest\.diff too_large|HTTP 406/i.test(output);
}

function parseGithubPrDetails(stdout: string): GatewayResult<GithubPrDetails> {
	const parsed = parseJson(stdout);
	if (!isRecord(parsed)) {
		return err({ code: "github_pr_view_parse_failed", message: "GitHub PR view output was not a JSON object." });
	}
	if (
		typeof parsed.number !== "number" ||
		typeof parsed.url !== "string" ||
		typeof parsed.title !== "string" ||
		typeof parsed.headRefName !== "string" ||
		typeof parsed.baseRefName !== "string"
	) {
		return err({ code: "github_pr_view_parse_failed", message: "GitHub PR view output was missing required fields." });
	}
	return ok({
		number: parsed.number,
		url: parsed.url,
		title: parsed.title,
		body: typeof parsed.body === "string" ? parsed.body : "",
		headRefName: parsed.headRefName,
		baseRefName: parsed.baseRefName,
	});
}

function parseJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		// Malformed gh JSON is converted to a gateway parse failure by the caller.
		return undefined;
	}
}
