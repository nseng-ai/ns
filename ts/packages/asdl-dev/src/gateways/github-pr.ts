import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runCommand, type CommandRunner, type ExecResult } from "@asdl/core/exec";

import { err, ok, type GatewayResult } from "../result.ts";
import { commandFailure } from "./command-failure.ts";

const PR_VIEW_FIELDS = "number,url,title,body,headRefName,baseRefName";
const VIEW_TIMEOUT_MS = 30_000;
const DIFF_TIMEOUT_MS = 60_000;
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

export interface GithubPrGateway {
	viewCurrentBranchPr(params: { cwd: string }): Promise<GatewayResult<GithubPrDetails>>;
	viewPr(params: { cwd: string; number: number }): Promise<GatewayResult<GithubPrDetails>>;
	getPrCommitMessages(params: { cwd: string; number: number }): Promise<GatewayResult<PrCommitMessage[]>>;
	getPrDiff(params: { cwd: string; number: number }): Promise<GatewayResult<string>>;
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
		const failure = commandFailure("gh", args, result, "github_pr_commits_failed", `Could not read commit messages for PR #${params.number}.`);
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

	async getPrDiff(params: { cwd: string; number: number }): Promise<GatewayResult<string>> {
		const args = ["pr", "diff", String(params.number)];
		const result = await this.runGh(args, params.cwd, DIFF_TIMEOUT_MS);
		const failure = commandFailure("gh", args, result, "github_pr_diff_failed", `Could not read diff for PR #${params.number}.`);
		if (failure !== undefined) return err(failure);
		return ok(result.stdout);
	}

	async editPr(params: { cwd: string; number: number; title: string; body: string }): Promise<GatewayResult<void>> {
		const tempDir = await mkdtemp(join(tmpdir(), "asdl-dev-pr-body-"));
		try {
			const bodyPath = join(tempDir, "body.md");
			await writeFile(bodyPath, `${params.body}\n`, "utf8");
			const args = ["pr", "edit", String(params.number), "--title", params.title, "--body-file", bodyPath];
			const result = await this.runGh(args, params.cwd, EDIT_TIMEOUT_MS);
			const failure = commandFailure("gh", args, result, "github_pr_edit_failed", `Could not update PR #${params.number}.`);
			if (failure !== undefined) return err(failure);
			return ok(undefined);
		} finally {
			await rm(tempDir, { force: true, recursive: true });
		}
	}

	private async viewPrWithArgs(params: { cwd: string; args: string[] }): Promise<GatewayResult<GithubPrDetails>> {
		const result = await this.runGh(params.args, params.cwd, VIEW_TIMEOUT_MS);
		const failure = commandFailure("gh", params.args, result, "github_pr_view_failed", "Could not read GitHub PR details.");
		if (failure !== undefined) return err(failure);

		const parsed = parseGithubPrDetails(result.stdout);
		if (!parsed.ok) return err(parsed.error);
		return ok(parsed.value);
	}

	private async runGh(args: readonly string[], cwd: string, timeoutMs: number): Promise<ExecResult> {
		return this.runner("gh", args, { cwd, timeout: timeoutMs });
	}
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

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
