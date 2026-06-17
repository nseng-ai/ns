import { runCommand, type ExecResult } from "@asdl/core/exec";
import { GITHUB_CLI_TIMEOUT_MS } from "@asdl/core/github-cli";
import { commandFailure, err, ok } from "@asdl/core/submit";

import { z } from "zod";

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

const prSummarySchema = z.object({
	number: z.number().int(),
	title: z.string(),
	url: z.string(),
	headRefName: z.string(),
	baseRefName: z.string(),
	state: z.string(),
	headRefOid: z.string().nullable().optional(),
});

const ghAuthorSchema = z.union([z.string(), z.object({ login: z.string().default("") }).loose(), z.null()]);
const ghReviewSchema = z
	.object({
		id: z.string(),
		author: ghAuthorSchema.default(""),
		body: z.string().default(""),
		state: z.string(),
		submittedAt: z.string().default(""),
	})
	.loose();
const ghReviewCommentSchema = z
	.object({
		databaseId: z.number().int().nullable().optional(),
		id: z.union([z.number().int(), z.string()]).optional(),
		body: z.string().default(""),
		author: ghAuthorSchema.default(""),
		path: z.string().default(""),
		line: z.number().int().nullable().default(null),
		startLine: z.number().int().nullable().optional(),
		createdAt: z.string().default(""),
	})
	.loose();
const ghPageInfoSchema = z
	.object({
		hasNextPage: z.boolean().default(false),
		endCursor: z.string().nullable().optional(),
	})
	.loose();
const ghReviewCommentConnectionSchema = z
	.object({
		nodes: z.array(ghReviewCommentSchema).default([]),
		pageInfo: ghPageInfoSchema.default({ hasNextPage: false }),
	})
	.loose();
const ghReviewThreadSchema = z
	.object({
		id: z.string().nullable().default(null),
		path: z.string().default(""),
		line: z.number().int().nullable().default(null),
		startLine: z.number().int().nullable().optional(),
		isResolved: z.boolean().default(false),
		isOutdated: z.boolean().default(false),
		comments: ghReviewCommentConnectionSchema.default({ nodes: [], pageInfo: { hasNextPage: false } }),
	})
	.loose();
const ghDiscussionCommentSchema = z
	.object({
		databaseId: z.number().int().optional(),
		id: z.union([z.number().int(), z.string()]).optional(),
		body: z.string().default(""),
		author: ghAuthorSchema.default(""),
		user: ghAuthorSchema.optional(),
		url: z.string().default(""),
		html_url: z.string().optional(),
	})
	.loose();
const ghGraphqlErrorsSchema = z.object({ errors: z.array(z.unknown()).optional() }).loose();
const ghReviewThreadsResponseSchema = z
	.object({
		data: z.object({
			repository: z.object({
				pullRequest: z.object({
					reviewThreads: z.object({ nodes: z.array(ghReviewThreadSchema).default([]), pageInfo: ghPageInfoSchema.default({ hasNextPage: false }) }).loose(),
				}),
			}),
		}),
	})
	.loose();
const ghReviewThreadCommentsResponseSchema = z
	.object({
		data: z.object({
			node: z.object({ comments: ghReviewCommentConnectionSchema }).loose().nullable(),
		}),
	})
	.loose();

type GhReviewThread = z.infer<typeof ghReviewThreadSchema>;

export const reviewThreadsQuery = `
query($owner: String!, $repo: String!, $number: Int!, $threadCursor: String) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      reviewThreads(first: 100, after: $threadCursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          isResolved
          isOutdated
          path
          line
          startLine
          comments(first: 100) {
            pageInfo { hasNextPage endCursor }
            nodes { databaseId body author { login } path line: originalLine startLine: originalStartLine createdAt }
          }
        }
      }
    }
  }
}`;

export const reviewThreadCommentsQuery = `
query($threadId: ID!, $commentCursor: String) {
  node(id: $threadId) {
    ... on PullRequestReviewThread {
      comments(first: 100, after: $commentCursor) {
        pageInfo { hasNextPage endCursor }
        nodes { databaseId body author { login } path line: originalLine startLine: originalStartLine createdAt }
      }
    }
  }
}`;

export class RealPrAddressGitHubGateway implements PrAddressGitHubGateway {
	private readonly runProcess: ProcessRunner;

	constructor(options: { runProcess?: ProcessRunner | undefined } = {}) {
		this.runProcess = options.runProcess ?? runProcess;
	}

	async getPr(prNumber: number, options: GatewayOptions): Promise<PRLookupResult> {
		return await this.getPrBySelector(String(prNumber), options);
	}

	async getPrForBranch(branch: string, options: GatewayOptions): Promise<PRLookupResult> {
		return await this.getPrBySelector(branch, options);
	}

	async listOpenPrs(options: GatewayOptions): Promise<GatewayResult<readonly PRSummary[]>> {
		// --limit 1000 caps pathological repos; pr-address stacks are far below this bound.
		const result = await this.runGh(["pr", "list", "--state", "open", "--json", "number,title,url,headRefName,baseRefName,state", "--limit", "1000"], options);
		if (result.exitCode !== 0) return err(failureFromProcess(result));
		const parseResult = parseJson(result.stdout, z.array(prSummarySchema));
		if (!parseResult.ok) return parseResult;
		return ok(parseResult.value.map(normalizePrSummary));
	}

	async getReviews(prNumber: number, options: GatewayOptions): Promise<GatewayResult<readonly PRReview[]>> {
		const result = await this.runGh(["pr", "view", String(prNumber), "--json", "reviews"], options);
		if (result.exitCode !== 0) return err(failureFromProcess(result));
		const parseResult = parseJson(result.stdout, z.object({ reviews: z.array(ghReviewSchema).default([]) }).loose());
		if (!parseResult.ok) return parseResult;
		return ok(parseResult.value.reviews.map(normalizeReview));
	}

	async getReviewThreads(prNumber: number, options: GatewayOptions & { shouldIncludeResolved: boolean }): Promise<GatewayResult<readonly PRReviewThread[]>> {
		const threads: PRReviewThread[] = [];
		let threadCursor: string | null | undefined;
		for (;;) {
			const result = await this.runGh(reviewThreadPageArgs(prNumber, threadCursor), options);
			if (result.exitCode !== 0) return err(failureFromProcess(result));
			const parseResult = parseGraphqlJson(result.stdout, ghReviewThreadsResponseSchema);
			if (!parseResult.ok) return parseResult;

			const connection = parseResult.value.data.repository.pullRequest.reviewThreads;
			for (const thread of connection.nodes) {
				const hydrated = await this.withCompleteThreadComments(thread, options);
				if (!hydrated.ok) return hydrated;
				threads.push(...normalizeReviewThread(hydrated.value));
			}

			if (!connection.pageInfo.hasNextPage) break;
			threadCursor = connection.pageInfo.endCursor;
			if (threadCursor === null || threadCursor === undefined || threadCursor === "") {
				return err(failureFromMessage("GitHub returned a reviewThreads page with hasNextPage but no endCursor", 0));
			}
		}
		return ok(options.shouldIncludeResolved ? threads : threads.filter((thread) => !thread.is_resolved));
	}

	async getDiscussionComments(prNumber: number, options: GatewayOptions): Promise<GatewayResult<readonly PRDiscussionComment[]>> {
		const result = await this.runGh(["pr", "view", String(prNumber), "--json", "comments"], options);
		if (result.exitCode !== 0) return err(failureFromProcess(result));
		const parseResult = parseJson(result.stdout, z.object({ comments: z.array(ghDiscussionCommentSchema).default([]) }).loose());
		if (!parseResult.ok) return parseResult;
		return ok(parseResult.value.comments.map(normalizeDiscussionComment).filter((comment) => comment.id !== 0));
	}

	private async withCompleteThreadComments(thread: GhReviewThread, options: GatewayOptions): Promise<GatewayResult<GhReviewThread>> {
		if (!thread.comments.pageInfo.hasNextPage) return ok(thread);
		if (thread.id === null) return ok(thread);

		const comments = [...thread.comments.nodes];
		let commentCursor = thread.comments.pageInfo.endCursor;
		for (;;) {
			if (commentCursor === null || commentCursor === undefined || commentCursor === "") {
				return err(failureFromMessage(`GitHub returned review thread ${thread.id} comments with hasNextPage but no endCursor`, 0));
			}
			const result = await this.runGh(reviewThreadCommentPageArgs(thread.id, commentCursor), options);
			if (result.exitCode !== 0) return err(failureFromProcess(result));
			const parseResult = parseGraphqlJson(result.stdout, ghReviewThreadCommentsResponseSchema);
			if (!parseResult.ok) return parseResult;
			const node = parseResult.value.data.node;
			if (node === null) return err(failureFromMessage(`GitHub returned no review thread for ${thread.id}`, 0));
			comments.push(...node.comments.nodes);
			if (!node.comments.pageInfo.hasNextPage) break;
			commentCursor = node.comments.pageInfo.endCursor;
		}
		return ok({ ...thread, comments: { ...thread.comments, nodes: comments, pageInfo: { hasNextPage: false } } });
	}

	private async getPrBySelector(selector: string, options: GatewayOptions): Promise<PRLookupResult> {
		const result = await this.runGh(["pr", "view", selector, "--json", "number,title,url,headRefName,headRefOid,baseRefName,state"], options);
		if (result.exitCode !== 0) {
			if (isLookupMiss(result)) return { type: "miss", stderr: result.stderr ?? "no PR found", returncode: result.exitCode };
			return { type: "failure", failure: failureFromProcess(result) };
		}
		const parseResult = parseJson(result.stdout, prSummarySchema);
		if (!parseResult.ok) return { type: "failure", failure: parseResult.error };
		return { type: "found", pr: normalizePrSummary(parseResult.value) };
	}

	private async runGh(args: readonly string[], options: GatewayOptions): Promise<ProcessResult> {
		return await this.runProcess({ command: "gh", args, cwd: options.cwd, env: options.env, timeout: GITHUB_CLI_TIMEOUT_MS });
	}
}

export class RealPrAddressGitGateway implements PrAddressGitGateway {
	private readonly runProcess: ProcessRunner;

	constructor(options: { runProcess?: ProcessRunner | undefined } = {}) {
		this.runProcess = options.runProcess ?? runProcess;
	}

	async getCurrentBranch(options: GatewayOptions): Promise<CurrentBranchResult> {
		const result = await this.runProcess({ command: "git", args: ["branch", "--show-current"], cwd: options.cwd, env: options.env, timeout: GIT_TIMEOUT_MS });
		if (result.exitCode !== 0) return { type: "failure", failure: failureFromProcess(result) };
		const branch = result.stdout.trim();
		if (branch === "") return { type: "detached" };
		return { type: "branch", branch };
	}

	async isInsideWorkTree(options: GatewayOptions): Promise<RepoContextResult> {
		const result = await this.runProcess({ command: "git", args: ["rev-parse", "--is-inside-work-tree"], cwd: options.cwd, env: options.env, timeout: GIT_TIMEOUT_MS });
		if (result.exitCode === 0) return result.stdout.trim() === "true" ? { type: "inside" } : { type: "outside" };
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
	return { stdout: result.stdout, stderr: result.stderr, exitCode: result.code, command: request.command, args: request.args };
}

function reviewThreadPageArgs(prNumber: number, threadCursor: string | null | undefined): string[] {
	return [
		"api",
		"graphql",
		"-F",
		"owner={owner}",
		"-F",
		"repo={repo}",
		"-F",
		`number=${prNumber}`,
		...(threadCursor === null || threadCursor === undefined ? [] : ["-F", `threadCursor=${threadCursor}`]),
		"-f",
		`query=${reviewThreadsQuery}`,
	];
}

function reviewThreadCommentPageArgs(threadId: string, commentCursor: string): string[] {
	return ["api", "graphql", "-F", `threadId=${threadId}`, "-F", `commentCursor=${commentCursor}`, "-f", `query=${reviewThreadCommentsQuery}`];
}

function normalizePrSummary(summary: z.infer<typeof prSummarySchema>): PRSummary {
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

function normalizeReview(review: z.infer<typeof ghReviewSchema>): PRReview {
	return {
		id: review.id,
		author: normalizeAuthor(review.author),
		body: review.body,
		state: review.state,
		submitted_at: review.submittedAt,
	};
}

function normalizeReviewThread(thread: z.infer<typeof ghReviewThreadSchema>): PRReviewThread[] {
	if (thread.id === null) return [];
	return [
		{
			id: thread.id,
			path: thread.path,
			line: thread.line,
			start_line: thread.startLine ?? null,
			is_resolved: thread.isResolved,
			is_outdated: thread.isOutdated,
			comments: thread.comments.nodes.map(normalizeReviewComment).filter((comment) => comment.id !== 0),
		},
	];
}

function normalizeReviewComment(comment: z.infer<typeof ghReviewCommentSchema>): PRReviewComment {
	return {
		id: numericId(comment.databaseId ?? comment.id),
		body: comment.body,
		author: normalizeAuthor(comment.author),
		path: comment.path,
		line: comment.line,
		start_line: comment.startLine ?? null,
		created_at: comment.createdAt,
	};
}

function normalizeDiscussionComment(comment: z.infer<typeof ghDiscussionCommentSchema>): PRDiscussionComment {
	return {
		id: numericId(comment.databaseId ?? comment.id),
		body: comment.body,
		author: normalizeAuthor(comment.user ?? comment.author),
		url: comment.html_url ?? comment.url,
	};
}

function normalizeAuthor(author: z.infer<typeof ghAuthorSchema>): string {
	if (typeof author === "string") return author;
	return author?.login ?? "";
}

function numericId(value: string | number | null | undefined): number {
	if (typeof value === "number") return value;
	if (typeof value === "string") {
		const numeric = Number(value);
		if (Number.isInteger(numeric)) return numeric;
	}
	return 0;
}

function isLookupMiss(result: ProcessResult): boolean {
	const text = `${result.stdout}\n${result.stderr}`.toLowerCase();
	return result.exitCode === 1 && (text.includes("no pull requests") || text.includes("no pr") || text.includes("not found"));
}

function parseJson<T>(text: string, schema: z.ZodType<T>): GatewayResult<T> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch (error) {
		return err(failureFromParse(text, jsonErrorMessage(error)));
	}
	const result = schema.safeParse(parsed);
	if (!result.success) return err(failureFromParse(text, z.prettifyError(result.error)));
	return ok(result.data);
}

function parseGraphqlJson<T>(text: string, schema: z.ZodType<T>): GatewayResult<T> {
	const base = parseJson(text, ghGraphqlErrorsSchema);
	if (!base.ok) return base;
	if (base.value.errors !== undefined && base.value.errors.length > 0) return err(failureFromParse(text, JSON.stringify(base.value.errors)));
	return parseJson(text, schema);
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
		details: { ...failure.details, stdout: result.stdout, stderr: result.stderr, returncode: result.exitCode },
	};
}

function execResultFromProcess(result: ProcessResult): ExecResult {
	return { stdout: result.stdout, stderr: result.stderr, code: result.exitCode, killed: false };
}

function failureFromParse(stdout: string, stderr: string): GatewayFailure {
	return gatewayFailure({
		code: "parse_failed",
		message: stderr || "failed to parse command output",
		stdout,
		stderr,
		returncode: 0,
	});
}

function failureFromMessage(stderr: string, returncode: number): GatewayFailure {
	return gatewayFailure({
		code: "process_failed",
		message: stderr,
		stdout: "",
		stderr,
		returncode,
	});
}

function gatewayFailure(options: { code: string; message: string; stdout: string; stderr: string; returncode: number }): GatewayFailure {
	const { code, message, stdout, stderr, returncode } = options;
	return {
		code,
		message,
		stdout,
		stderr,
		returncode,
		details: { stdout, stderr, returncode },
	};
}

function jsonErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}
