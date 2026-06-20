import { runCommand, type CommandRunner, type ExecResult } from "@asdl/core/exec";
import {
	RealGithubPrFeedbackGateway,
	type GithubPrDiscussionComment,
	type GithubPrFeedbackFailure,
	type GithubPrFeedbackGateway,
	type GithubPrFeedbackOptions,
	type GithubPrReview,
	type GithubPrReviewComment,
	type GithubPrReviewThread,
	type GithubPrSummary,
} from "@asdl/core/github-pr-feedback";
import { commandFailure } from "@asdl/core/submit";

import type {
	CurrentBranchResult,
	GatewayFailure,
	GatewayOptions,
	GatewayResult,
	PrAddressGitGateway,
	PrAddressGitHubGateway,
	PRDiscussionComment,
	PRLookupResult,
	PRReview,
	PRReviewComment,
	PRReviewThread,
	PRSummary,
	RepoContextResult,
} from "./core/gateways.ts";

export type {
	CurrentBranchResult,
	GatewayFailure,
	GatewayOptions,
	GatewayResult,
	PrAddressGitGateway,
	PrAddressGitHubGateway,
	PRDiscussionComment,
	PRLookupMiss,
	PRLookupResult,
	PRReview,
	PRReviewComment,
	PRReviewThread,
	PRSummary,
	RepoContextResult,
} from "./core/gateways.ts";

export interface ProcessRequest {
	command: string;
	args: readonly string[];
	cwd: string;
	env?: NodeJS.ProcessEnv | undefined;
	timeout?: number | undefined;
}

export interface ProcessResult {
	stdout: string;
	stderr: string;
	exitCode: number;
	command?: string | undefined;
	args?: readonly string[] | undefined;
}

export type ProcessRunner = (request: ProcessRequest) => Promise<ProcessResult>;

const GIT_TIMEOUT_MS = 10_000;

export class RealPrAddressGitHubGateway implements PrAddressGitHubGateway {
	private readonly prFeedback: GithubPrFeedbackGateway;

	constructor(
		options: {
			runProcess?: ProcessRunner | undefined;
			prFeedback?: GithubPrFeedbackGateway | undefined;
		} = {},
	) {
		this.prFeedback =
			options.prFeedback ??
			new RealGithubPrFeedbackGateway(
				processRunnerToCommandRunner(options.runProcess ?? runProcess),
			);
	}

	async getPr(prNumber: number, options: GatewayOptions): Promise<PRLookupResult> {
		const result = await this.prFeedback.getPr({ ...feedbackOptions(options), prNumber });
		return mapLookupResult(result);
	}

	async getPrForBranch(branch: string, options: GatewayOptions): Promise<PRLookupResult> {
		const result = await this.prFeedback.getPrForBranch({ ...feedbackOptions(options), branch });
		return mapLookupResult(result);
	}

	async listOpenPrs(options: GatewayOptions): Promise<GatewayResult<readonly PRSummary[]>> {
		const result = await this.prFeedback.listOpenPrs(feedbackOptions(options));
		if (!result.ok) return { ok: false, error: failureFromCore(result.error) };
		return { ok: true, value: result.value.map(prSummaryFromCore) };
	}

	async getReviews(
		prNumber: number,
		options: GatewayOptions,
	): Promise<GatewayResult<readonly PRReview[]>> {
		const result = await this.prFeedback.getPrReviews({ ...feedbackOptions(options), prNumber });
		if (!result.ok) return { ok: false, error: failureFromCore(result.error) };
		return { ok: true, value: result.value.map(reviewFromCore) };
	}

	async getReviewThreads(
		prNumber: number,
		options: GatewayOptions & { shouldIncludeResolved: boolean },
	): Promise<GatewayResult<readonly PRReviewThread[]>> {
		const result = await this.prFeedback.getPrReviewThreads({
			...feedbackOptions(options),
			prNumber,
		});
		if (!result.ok) return { ok: false, error: failureFromCore(result.error) };
		const threads = result.value.map(reviewThreadFromCore);
		return {
			ok: true,
			value: options.shouldIncludeResolved
				? threads
				: threads.filter((thread) => !thread.is_resolved),
		};
	}

	async getDiscussionComments(
		prNumber: number,
		options: GatewayOptions,
	): Promise<GatewayResult<readonly PRDiscussionComment[]>> {
		const result = await this.prFeedback.getPrDiscussionComments({
			...feedbackOptions(options),
			prNumber,
		});
		if (!result.ok) return { ok: false, error: failureFromCore(result.error) };
		return { ok: true, value: result.value.map(discussionCommentFromCore) };
	}
}

export class RealPrAddressGitGateway implements PrAddressGitGateway {
	private readonly runProcess: ProcessRunner;

	constructor(options: { runProcess?: ProcessRunner | undefined } = {}) {
		this.runProcess = options.runProcess ?? runProcess;
	}

	async getCurrentBranch(options: GatewayOptions): Promise<CurrentBranchResult> {
		const result = await this.runProcess({
			command: "git",
			args: ["branch", "--show-current"],
			cwd: options.cwd,
			env: options.env,
			timeout: GIT_TIMEOUT_MS,
		});
		if (result.exitCode !== 0) return { type: "failure", failure: failureFromProcess(result) };
		const branch = result.stdout.trim();
		if (branch === "") return { type: "detached" };
		return { type: "branch", branch };
	}

	async isInsideWorkTree(options: GatewayOptions): Promise<RepoContextResult> {
		const result = await this.runProcess({
			command: "git",
			args: ["rev-parse", "--is-inside-work-tree"],
			cwd: options.cwd,
			env: options.env,
			timeout: GIT_TIMEOUT_MS,
		});
		if (result.exitCode === 0)
			return result.stdout.trim() === "true" ? { type: "inside" } : { type: "outside" };
		// git exits 128 with "not a git repository" outside any work tree.
		if (result.exitCode === 128) return { type: "outside" };
		return { type: "failure", failure: failureFromProcess(result) };
	}
}

export async function runProcess(request: ProcessRequest): Promise<ProcessResult> {
	const result = await runCommand(request.command, request.args, {
		cwd: request.cwd,
		...(request.env === undefined ? {} : { env: request.env }),
		...(request.timeout === undefined ? {} : { timeout: request.timeout }),
	});
	return {
		stdout: result.stdout,
		stderr: result.stderr,
		exitCode: result.code,
		command: request.command,
		args: request.args,
	};
}

function processRunnerToCommandRunner(runProcess: ProcessRunner): CommandRunner {
	return async (command, args, options = {}) => {
		const result = await runProcess({
			command,
			args,
			cwd: options.cwd ?? ".",
			...(options.env === undefined ? {} : { env: options.env }),
			...(options.timeout === undefined ? {} : { timeout: options.timeout }),
		});
		return { stdout: result.stdout, stderr: result.stderr, code: result.exitCode, killed: false };
	};
}

function feedbackOptions(options: GatewayOptions): GithubPrFeedbackOptions {
	return {
		cwd: options.cwd,
		...(options.env === undefined ? {} : { env: options.env }),
	};
}

function mapLookupResult(
	result: Awaited<ReturnType<GithubPrFeedbackGateway["getPr"]>>,
): PRLookupResult {
	if (result.type === "failure")
		return { type: "failure", failure: failureFromCore(result.failure) };
	if (result.type === "miss")
		return { type: "miss", stderr: result.stderr, returncode: result.exitCode };
	return { type: "found", pr: prSummaryFromCore(result.pr) };
}

function prSummaryFromCore(summary: GithubPrSummary): PRSummary {
	return {
		number: summary.number,
		title: summary.title,
		url: summary.url,
		head_ref_name: summary.headRefName,
		base_ref_name: summary.baseRefName,
		state: summary.state,
		head_ref_oid: summary.headRefOid,
	};
}

function reviewFromCore(review: GithubPrReview): PRReview {
	return {
		id: review.id,
		author: review.author,
		body: review.body,
		state: review.state,
		submitted_at: review.submittedAt,
	};
}

function reviewThreadFromCore(thread: GithubPrReviewThread): PRReviewThread {
	return {
		id: thread.id,
		path: thread.path,
		line: thread.line,
		start_line: thread.startLine,
		is_resolved: thread.isResolved,
		is_outdated: thread.isOutdated,
		comments: thread.comments.map(reviewCommentFromCore),
	};
}

function reviewCommentFromCore(comment: GithubPrReviewComment): PRReviewComment {
	return {
		id: comment.id,
		body: comment.body,
		author: comment.author,
		path: comment.path,
		line: comment.line,
		start_line: comment.startLine,
		created_at: comment.createdAt,
	};
}

function discussionCommentFromCore(comment: GithubPrDiscussionComment): PRDiscussionComment {
	return {
		id: comment.id,
		body: comment.body,
		author: comment.author,
		url: comment.url,
	};
}

function failureFromCore(failure: GithubPrFeedbackFailure): GatewayFailure {
	const details = failure.details ?? {};
	const stdout = stringDetail(details.stdout);
	const graphqlErrors = details.graphqlErrors;
	const stderr = stringDetail(details.stderr) ?? graphqlErrorsDetail(graphqlErrors);
	const returncode = numberDetail(details.exitCode) ?? numberDetail(details.returncode) ?? 0;
	return {
		code: failure.code,
		message: failure.message,
		...(stdout === undefined ? {} : { stdout }),
		...(stderr === undefined ? {} : { stderr }),
		returncode,
		details,
	};
}

function stringDetail(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function graphqlErrorsDetail(value: unknown): string | undefined {
	if (value === undefined) return undefined;
	return JSON.stringify(value);
}

function numberDetail(value: unknown): number | undefined {
	return typeof value === "number" ? value : undefined;
}

function failureFromProcess(result: ProcessResult): GatewayFailure {
	const stderr = result.stderr.trim();
	const stdout = result.stdout.trim();
	const message = stderr || stdout || `process exited with code ${result.exitCode}`;
	const failure = commandFailure({
		command: result.command ?? "process",
		args: result.args ?? [],
		result: execResultFromProcess(result),
		code: "process_failed",
		message,
	}) ?? { code: "process_failed", message, details: {} };
	return {
		...failure,
		stdout: result.stdout,
		stderr: result.stderr,
		returncode: result.exitCode,
		details: {
			...failure.details,
			stdout: result.stdout,
			stderr: result.stderr,
			returncode: result.exitCode,
		},
	};
}

function execResultFromProcess(result: ProcessResult): ExecResult {
	return { stdout: result.stdout, stderr: result.stderr, code: result.exitCode, killed: false };
}
