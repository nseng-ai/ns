import { runCommand } from "@nseng-ai/foundation/exec";
import type { CommandRunner, ExecResult } from "@nseng-ai/foundation/command";
import {
	GITHUB_CLI_TIMEOUT_MS,
	runGitHubCliAsExecResult,
} from "@nseng-ai/capability-kit/github/cli";
import type { TimerScheduler } from "@nseng-ai/foundation/timers";
import { systemTimerScheduler } from "@nseng-ai/foundation/time";
import { isRecord } from "@nseng-ai/foundation/primitives";
import { withTemporaryFile } from "@nseng-ai/capability-kit/temp-files";
import {
	commandFailure,
	err,
	ok,
	type GatewayResult,
} from "@nseng-ai/capability-kit/gateway-result";

const PR_VIEW_FIELDS = "number,url,title,body,headRefName,baseRefName";
const VIEW_TIMEOUT_MS = GITHUB_CLI_TIMEOUT_MS;
const VIEW_PR_RETRY_DELAYS_MS = [500, 1_500, 3_000] as const;
const DIFF_TIMEOUT_MS = 60_000;
const PATCH_ID_TIMEOUT_MS = 60_000;
const EDIT_TIMEOUT_MS = 60_000;

interface RunGitOptions {
	args: readonly string[];
	cwd: string;
	timeoutMs: number;
	stdin?: string;
}

interface CheckedCommandFailure {
	code: string;
	message: string;
}

interface CheckedGhCommandRun {
	execResult: ExecResult;
	checked: GatewayResult<ExecResult>;
}

interface GithubPrGatewayOptions {
	viewPrRetryDelaysMs?: readonly number[];
	timers?: TimerScheduler;
}

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

export interface PrDiffLocator {
	cwd: string;
	number: number;
	baseRefName?: string;
	headRefName?: string;
}

interface LocalPrDiffLocator {
	cwd: string;
	number: number;
	baseRefName: string;
	headRefName: string;
}

export interface GithubPrGateway {
	viewCurrentBranchPr(params: { cwd: string }): Promise<GatewayResult<GithubPrDetails>>;
	viewPr(params: { cwd: string; number: number }): Promise<GatewayResult<GithubPrDetails>>;
	getPrCommitMessages(params: {
		cwd: string;
		number: number;
	}): Promise<GatewayResult<PrCommitMessage[]>>;
	getPrDiff(params: PrDiffLocator): Promise<GatewayResult<string>>;
	stablePatchIdForPr(params: PrDiffLocator): Promise<GatewayResult<StablePatchIdForPrResult>>;
	editPr(params: {
		cwd: string;
		number: number;
		title: string;
		body: string;
	}): Promise<GatewayResult<void>>;
}

export class RealGithubPrGateway implements GithubPrGateway {
	private readonly runner: CommandRunner;
	private readonly viewPrRetryDelaysMs: readonly number[];
	private readonly timers: TimerScheduler;

	constructor(runner: CommandRunner = runCommand, options: GithubPrGatewayOptions = {}) {
		this.runner = runner;
		this.viewPrRetryDelaysMs = options.viewPrRetryDelaysMs ?? VIEW_PR_RETRY_DELAYS_MS;
		this.timers = options.timers ?? systemTimerScheduler;
	}

	async viewCurrentBranchPr(params: { cwd: string }): Promise<GatewayResult<GithubPrDetails>> {
		return this.viewPrWithArgs({ cwd: params.cwd, args: ["pr", "view", "--json", PR_VIEW_FIELDS] });
	}

	async viewPr(params: { cwd: string; number: number }): Promise<GatewayResult<GithubPrDetails>> {
		return this.viewPrWithArgs({
			cwd: params.cwd,
			args: ["pr", "view", String(params.number), "--json", PR_VIEW_FIELDS],
			retryDelaysMs: this.viewPrRetryDelaysMs,
		});
	}

	async getPrCommitMessages(params: {
		cwd: string;
		number: number;
	}): Promise<GatewayResult<PrCommitMessage[]>> {
		const args = ["pr", "view", String(params.number), "--json", "commits"];
		const result = await this.runCheckedGh({
			args,
			cwd: params.cwd,
			timeoutMs: VIEW_TIMEOUT_MS,
			failure: {
				code: "github_pr_commits_failed",
				message: `Could not read commit messages for PR #${params.number}.`,
			},
		});
		if (!result.ok) return result;

		const parsed = parseJson(result.value.stdout);
		if (!isRecord(parsed) || !Array.isArray(parsed.commits)) {
			return err({
				code: "github_pr_commits_parse_failed",
				message: `GitHub commits output for PR #${params.number} had an unexpected shape.`,
			});
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

	async getPrDiff(params: PrDiffLocator): Promise<GatewayResult<string>> {
		const args = ["pr", "diff", String(params.number)];
		const run = await this.runCheckedGhWithExecResult({
			args,
			cwd: params.cwd,
			timeoutMs: DIFF_TIMEOUT_MS,
			failure: {
				code: "github_pr_diff_failed",
				message: `Could not read diff for PR #${params.number}.`,
			},
		});
		if (run.checked.ok) return ok(run.checked.value.stdout);

		if (
			params.baseRefName !== undefined &&
			params.headRefName !== undefined &&
			isGithubDiffTooLarge(run.execResult)
		) {
			return await this.getLocalPrDiff({
				cwd: params.cwd,
				number: params.number,
				baseRefName: params.baseRefName,
				headRefName: params.headRefName,
			});
		}
		return run.checked;
	}

	async stablePatchIdForPr(
		params: PrDiffLocator,
	): Promise<GatewayResult<StablePatchIdForPrResult>> {
		const diff = await this.getPrDiff(params);
		if (!diff.ok) return diff;

		const args = ["patch-id", "--stable"];
		const result = await this.runCheckedGit({
			args,
			cwd: params.cwd,
			timeoutMs: PATCH_ID_TIMEOUT_MS,
			stdin: diff.value,
			failure: {
				code: "git_patch_id_failed",
				message: `Could not compute stable patch id for PR #${params.number}.`,
			},
		});
		if (!result.ok) return result;

		const patchId = result.value.stdout.trim().split(/\s+/, 1)[0] ?? "";
		if (patchId === "") {
			return err({
				code: "git_patch_id_parse_failed",
				message: `Stable patch-id output for PR #${params.number} was empty or malformed.`,
			});
		}
		return ok({ patchId, diff: diff.value });
	}

	async editPr(params: {
		cwd: string;
		number: number;
		title: string;
		body: string;
	}): Promise<GatewayResult<void>> {
		return await withTemporaryFile(
			{ prefix: "ns-dev-pr-body-", filename: "body.md", contents: `${params.body}\n` },
			async (bodyPath) => {
				const args = [
					"pr",
					"edit",
					String(params.number),
					"--title",
					params.title,
					"--body-file",
					bodyPath,
				];
				const result = await this.runCheckedGh({
					args,
					cwd: params.cwd,
					timeoutMs: EDIT_TIMEOUT_MS,
					failure: {
						code: "github_pr_edit_failed",
						message: `Could not update PR #${params.number}.`,
					},
				});
				if (!result.ok) return result;
				return ok(undefined);
			},
		);
	}

	private async viewPrWithArgs(params: {
		cwd: string;
		args: string[];
		retryDelaysMs?: readonly number[];
	}): Promise<GatewayResult<GithubPrDetails>> {
		const retryDelaysMs = params.retryDelaysMs ?? [];
		for (const [attemptIndex, retryDelayMs] of [...retryDelaysMs, undefined].entries()) {
			if (attemptIndex > 0) {
				await this.timers.delay(retryDelaysMs[attemptIndex - 1] ?? 0);
			}

			const result = await this.runCheckedGh({
				args: params.args,
				cwd: params.cwd,
				timeoutMs: VIEW_TIMEOUT_MS,
				failure: {
					code: "github_pr_view_failed",
					message: "Could not read GitHub PR details.",
				},
			});
			if (!result.ok) {
				if (retryDelayMs !== undefined) continue;
				return result;
			}

			const parsed = parseGithubPrDetails(result.value.stdout);
			if (!parsed.ok) return err(parsed.error);
			return ok(parsed.value);
		}

		return err({
			code: "github_pr_view_failed",
			message: "Could not read GitHub PR details.",
		});
	}

	private async getLocalPrDiff(params: LocalPrDiffLocator): Promise<GatewayResult<string>> {
		const args = ["diff", `${params.baseRefName}...${params.headRefName}`];
		const result = await this.runCheckedGit({
			args,
			cwd: params.cwd,
			timeoutMs: DIFF_TIMEOUT_MS,
			failure: {
				code: "github_pr_local_diff_failed",
				message: `GitHub PR #${params.number} diff was too large for GitHub; could not read local diff for ${params.baseRefName}...${params.headRefName}.`,
			},
		});
		if (!result.ok) return result;
		return ok(result.value.stdout);
	}

	private async runCheckedGh(params: {
		args: readonly string[];
		cwd: string;
		timeoutMs: number;
		failure: CheckedCommandFailure;
	}): Promise<GatewayResult<ExecResult>> {
		return (await this.runCheckedGhWithExecResult(params)).checked;
	}

	private async runCheckedGhWithExecResult(params: {
		args: readonly string[];
		cwd: string;
		timeoutMs: number;
		failure: CheckedCommandFailure;
	}): Promise<CheckedGhCommandRun> {
		const execResult = await this.runGh(params.args, params.cwd, params.timeoutMs);
		return {
			execResult,
			checked: checkedCommandResult({
				command: "gh",
				args: params.args,
				result: execResult,
				failure: params.failure,
			}),
		};
	}

	private async runCheckedGit(
		options: RunGitOptions & { failure: CheckedCommandFailure },
	): Promise<GatewayResult<ExecResult>> {
		const result = await this.runGit(options);
		return checkedCommandResult({
			command: "git",
			args: options.args,
			result,
			failure: options.failure,
		});
	}

	private runGh(args: readonly string[], cwd: string, timeoutMs: number): Promise<ExecResult> {
		return runGitHubCliAsExecResult({ runner: this.runner, args, cwd, timeoutMs });
	}

	private runGit(options: RunGitOptions): Promise<ExecResult> {
		return this.runner("git", options.args, {
			cwd: options.cwd,
			timeout: options.timeoutMs,
			...(options.stdin === undefined ? {} : { stdin: options.stdin }),
		});
	}
}

function checkedCommandResult(params: {
	command: string;
	args: readonly string[];
	result: ExecResult;
	failure: CheckedCommandFailure;
}): GatewayResult<ExecResult> {
	const failure = commandFailure({
		command: params.command,
		args: params.args,
		result: params.result,
		code: params.failure.code,
		message: params.failure.message,
	});
	if (failure !== undefined) return err(failure);
	return ok(params.result);
}

function isGithubDiffTooLarge(result: ExecResult): boolean {
	const output = `${result.stderr}\n${result.stdout}`;
	return (
		result.code === 1 &&
		/diff exceeded the maximum number of lines|PullRequest\.diff too_large|HTTP 406/i.test(output)
	);
}

function parseGithubPrDetails(stdout: string): GatewayResult<GithubPrDetails> {
	const parsed = parseJson(stdout);
	if (!isRecord(parsed)) {
		return err({
			code: "github_pr_view_parse_failed",
			message: "GitHub PR view output was not a JSON object.",
		});
	}
	if (
		typeof parsed.number !== "number" ||
		typeof parsed.url !== "string" ||
		typeof parsed.title !== "string" ||
		typeof parsed.headRefName !== "string" ||
		typeof parsed.baseRefName !== "string"
	) {
		return err({
			code: "github_pr_view_parse_failed",
			message: "GitHub PR view output was missing required fields.",
		});
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
