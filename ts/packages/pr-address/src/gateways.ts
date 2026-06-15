import { runCommand } from "@asdl/core/exec";

import { z } from "zod";

export interface GatewayFailure {
	stderr: string;
	stdout: string;
	returncode: number;
}

export interface PRLookupMiss {
	type: "miss";
	stderr: string;
	returncode: number;
}

export interface PRSummary {
	number: number;
	title: string;
	url: string;
	head_ref_name: string;
	base_ref_name: string;
	state: string;
	head_ref_oid?: string | null | undefined;
}

export interface PRReview {
	id: string;
	author: string;
	body: string;
	state: string;
	submitted_at: string;
}

export interface PRReviewComment {
	id: number;
	body: string;
	author: string;
	path: string;
	line: number | null;
	start_line: number | null;
	created_at: string;
}

export interface PRReviewThread {
	id: string;
	path: string;
	line: number | null;
	start_line: number | null;
	is_resolved: boolean;
	is_outdated: boolean;
	comments: readonly PRReviewComment[];
}

export interface PRDiscussionComment {
	id: number;
	body: string;
	author: string;
	url: string;
}

export interface Reaction {
	id: number;
	comment_id: number;
	content: string;
}

export interface PRReviewThreadState {
	thread_id: string;
	is_resolved: boolean;
}

export interface RestructuredFile {
	status: string;
	old_path: string | null;
	new_path: string;
	similarity: number | null;
}

export type GatewayResult<T> = { type: "ok"; value: T } | { type: "failure"; failure: GatewayFailure };
export type PRLookupResult = { type: "found"; pr: PRSummary } | PRLookupMiss | { type: "failure"; failure: GatewayFailure };
export type CurrentBranchResult = { type: "branch"; branch: string } | { type: "detached" } | { type: "failure"; failure: GatewayFailure };
export type BranchHeadOidResult = { type: "found"; oid: string } | { type: "missing"; stderr: string; returncode: number } | { type: "failure"; failure: GatewayFailure };
export type CommitChangedFilesResult = { type: "ok"; files: readonly string[] } | { type: "failure"; failure: GatewayFailure };
export type RepoContextResult = { type: "inside" } | { type: "outside" } | { type: "failure"; failure: GatewayFailure };
export type WorkTreeRootResult = { type: "inside"; root: string } | { type: "outside" } | { type: "failure"; failure: GatewayFailure };

export interface GatewayOptions {
	cwd: string;
	env?: NodeJS.ProcessEnv | undefined;
}

export interface PrAddressGitHubGateway {
	getPr(prNumber: number, options: GatewayOptions): Promise<PRLookupResult>;
	getPrForBranch(branch: string, options: GatewayOptions): Promise<PRLookupResult>;
	listOpenPrs(options: GatewayOptions): Promise<GatewayResult<readonly PRSummary[]>>;
	getReviews(prNumber: number, options: GatewayOptions): Promise<GatewayResult<readonly PRReview[]>>;
	getReviewThreads(prNumber: number, options: GatewayOptions & { shouldIncludeResolved: boolean }): Promise<GatewayResult<readonly PRReviewThread[]>>;
	getDiscussionComments(prNumber: number, options: GatewayOptions): Promise<GatewayResult<readonly PRDiscussionComment[]>>;
	addPrDiscussionComment(prNumber: number, body: string, options: GatewayOptions): Promise<GatewayResult<PRDiscussionComment>>;
	addPrDiscussionCommentReaction(commentId: number, reaction: string, options: GatewayOptions): Promise<GatewayResult<Reaction>>;
	addReviewThreadReply(threadId: string, body: string, options: GatewayOptions): Promise<GatewayResult<PRReviewComment>>;
	resolveReviewThread(threadId: string, options: GatewayOptions): Promise<GatewayResult<PRReviewThreadState>>;
	unresolveReviewThread(threadId: string, options: GatewayOptions): Promise<GatewayResult<PRReviewThreadState>>;
}

export interface PrAddressGitGateway {
	getCurrentBranch(options: GatewayOptions): Promise<CurrentBranchResult>;
	isInsideWorkTree(options: GatewayOptions): Promise<RepoContextResult>;
	getWorkTreeRoot(options: GatewayOptions): Promise<WorkTreeRootResult>;
	getBranchHeadOid(branch: string, options: GatewayOptions): Promise<BranchHeadOidResult>;
	getCommitChangedFiles(commitSha: string, options: GatewayOptions): Promise<CommitChangedFilesResult>;
	getRestructuredFiles(baseRefName: string, options: GatewayOptions): Promise<GatewayResult<readonly RestructuredFile[]>>;
}

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
}

export type ProcessRunner = (request: ProcessRequest) => Promise<ProcessResult>;

const GIT_TIMEOUT_MS = 10_000;
const GH_TIMEOUT_MS = 30_000;

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
const ghReviewThreadSchema = z
	.object({
		id: z.string().nullable().default(null),
		path: z.string().default(""),
		line: z.number().int().nullable().default(null),
		startLine: z.number().int().nullable().optional(),
		isResolved: z.boolean().default(false),
		isOutdated: z.boolean().default(false),
		comments: z.object({ nodes: z.array(ghReviewCommentSchema).default([]) }).loose().default({ nodes: [] }),
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
const ghReactionSchema = z
	.object({
		id: z.union([z.number().int(), z.string()]),
		content: z.string(),
	})
	.loose();
const ghReviewThreadStateSchema = z.object({ id: z.string(), isResolved: z.boolean() }).loose();
const ghGraphqlErrorsSchema = z.object({ errors: z.array(z.unknown()).optional() }).loose();
const ghReviewThreadsResponseSchema = z
	.object({
		data: z.object({
			repository: z.object({
				pullRequest: z.object({
					reviewThreads: z.object({ nodes: z.array(ghReviewThreadSchema).default([]) }),
				}),
			}),
		}),
	})
	.loose();

const resolveReviewThreadMutation = `
mutation($threadId: ID!) {
  resolveReviewThread(input: {threadId: $threadId}) {
    thread { id isResolved }
  }
}`;

const unresolveReviewThreadMutation = `
mutation($threadId: ID!) {
  unresolveReviewThread(input: {threadId: $threadId}) {
    thread { id isResolved }
  }
}`;

const addReviewThreadReplyMutation = `
mutation($threadId: ID!, $body: String!) {
  addPullRequestReviewThreadReply(input: {pullRequestReviewThreadId: $threadId, body: $body}) {
    comment { databaseId body author { login } path line: originalLine startLine: originalStartLine createdAt }
  }
}`;

// Known limitation: this query does not paginate reviewThreads(first: 100)
// or comments(first: 20). Large PRs can be under-collected until pagination
// is implemented.
export const reviewThreadsQuery = `
query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      reviewThreads(first: 100) {
        nodes {
          id
          isResolved
          isOutdated
          path
          line
          startLine
          comments(first: 20) {
            nodes { databaseId body author { login } path line: originalLine startLine: originalStartLine createdAt }
          }
        }
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
		if (result.exitCode !== 0) return { type: "failure", failure: failureFromProcess(result) };
		const parseResult = parseJson(result.stdout, z.array(prSummarySchema));
		if (parseResult.type === "failure") return parseResult;
		return { type: "ok", value: parseResult.value.map(normalizePrSummary) };
	}

	async getReviews(prNumber: number, options: GatewayOptions): Promise<GatewayResult<readonly PRReview[]>> {
		const result = await this.runGh(["pr", "view", String(prNumber), "--json", "reviews"], options);
		if (result.exitCode !== 0) return { type: "failure", failure: failureFromProcess(result) };
		const parseResult = parseJson(result.stdout, z.object({ reviews: z.array(ghReviewSchema).default([]) }).loose());
		if (parseResult.type === "failure") return parseResult;
		return { type: "ok", value: parseResult.value.reviews.map(normalizeReview) };
	}

	async getReviewThreads(prNumber: number, options: GatewayOptions & { shouldIncludeResolved: boolean }): Promise<GatewayResult<readonly PRReviewThread[]>> {
		const result = await this.runGh(["api", "graphql", "-F", "owner={owner}", "-F", "repo={repo}", "-F", `number=${prNumber}`, "-f", `query=${reviewThreadsQuery}`], options);
		if (result.exitCode !== 0) return { type: "failure", failure: failureFromProcess(result) };
		const parseResult = parseGraphqlJson(result.stdout, ghReviewThreadsResponseSchema);
		if (parseResult.type === "failure") return parseResult;
		const threads = parseResult.value.data.repository.pullRequest.reviewThreads.nodes.flatMap(normalizeReviewThread);
		return { type: "ok", value: options.shouldIncludeResolved ? threads : threads.filter((thread) => !thread.is_resolved) };
	}

	async getDiscussionComments(prNumber: number, options: GatewayOptions): Promise<GatewayResult<readonly PRDiscussionComment[]>> {
		const result = await this.runGh(["pr", "view", String(prNumber), "--json", "comments"], options);
		if (result.exitCode !== 0) return { type: "failure", failure: failureFromProcess(result) };
		const parseResult = parseJson(result.stdout, z.object({ comments: z.array(ghDiscussionCommentSchema).default([]) }).loose());
		if (parseResult.type === "failure") return parseResult;
		return { type: "ok", value: parseResult.value.comments.map(normalizeDiscussionComment).filter((comment) => comment.id !== 0) };
	}

	async addPrDiscussionComment(prNumber: number, body: string, options: GatewayOptions): Promise<GatewayResult<PRDiscussionComment>> {
		const result = await this.runGh(["api", "--method", "POST", `repos/{owner}/{repo}/issues/${prNumber}/comments`, "-f", `body=${body}`], options);
		if (result.exitCode !== 0) return { type: "failure", failure: failureFromProcess(result) };
		const parseResult = parseJson(result.stdout, ghDiscussionCommentSchema);
		if (parseResult.type === "failure") return parseResult;
		return { type: "ok", value: normalizeDiscussionComment(parseResult.value) };
	}

	async addPrDiscussionCommentReaction(commentId: number, reaction: string, options: GatewayOptions): Promise<GatewayResult<Reaction>> {
		const result = await this.runGh(["api", "--method", "POST", `repos/{owner}/{repo}/issues/comments/${commentId}/reactions`, "-H", "Accept: application/vnd.github+json", "-f", `content=${reaction}`], options);
		if (result.exitCode !== 0) return { type: "failure", failure: failureFromProcess(result) };
		const parseResult = parseJson(result.stdout, ghReactionSchema);
		if (parseResult.type === "failure") return parseResult;
		return { type: "ok", value: { id: numericId(parseResult.value.id), comment_id: commentId, content: parseResult.value.content } };
	}

	async addReviewThreadReply(threadId: string, body: string, options: GatewayOptions): Promise<GatewayResult<PRReviewComment>> {
		const result = await this.runGh(["api", "graphql", "-F", `threadId=${threadId}`, "-f", `body=${body}`, "-f", `query=${addReviewThreadReplyMutation}`], options);
		if (result.exitCode !== 0) return { type: "failure", failure: failureFromProcess(result) };
		const parseResult = parseGraphqlJson(result.stdout, z.object({ data: z.object({ addPullRequestReviewThreadReply: z.object({ comment: ghReviewCommentSchema }) }) }).loose());
		if (parseResult.type === "failure") return parseResult;
		return { type: "ok", value: normalizeReviewComment(parseResult.value.data.addPullRequestReviewThreadReply.comment) };
	}

	async resolveReviewThread(threadId: string, options: GatewayOptions): Promise<GatewayResult<PRReviewThreadState>> {
		const result = await this.runGh(["api", "graphql", "-F", `threadId=${threadId}`, "-f", `query=${resolveReviewThreadMutation}`], options);
		if (result.exitCode !== 0) return { type: "failure", failure: failureFromProcess(result) };
		const parseResult = parseGraphqlJson(result.stdout, z.object({ data: z.object({ resolveReviewThread: z.object({ thread: ghReviewThreadStateSchema }) }) }).loose());
		if (parseResult.type === "failure") return parseResult;
		const thread = parseResult.value.data.resolveReviewThread.thread;
		return { type: "ok", value: { thread_id: thread.id, is_resolved: thread.isResolved } };
	}

	async unresolveReviewThread(threadId: string, options: GatewayOptions): Promise<GatewayResult<PRReviewThreadState>> {
		const result = await this.runGh(["api", "graphql", "-F", `threadId=${threadId}`, "-f", `query=${unresolveReviewThreadMutation}`], options);
		if (result.exitCode !== 0) return { type: "failure", failure: failureFromProcess(result) };
		const parseResult = parseGraphqlJson(result.stdout, z.object({ data: z.object({ unresolveReviewThread: z.object({ thread: ghReviewThreadStateSchema }) }) }).loose());
		if (parseResult.type === "failure") return parseResult;
		const thread = parseResult.value.data.unresolveReviewThread.thread;
		return { type: "ok", value: { thread_id: thread.id, is_resolved: thread.isResolved } };
	}

	private async getPrBySelector(selector: string, options: GatewayOptions): Promise<PRLookupResult> {
		const result = await this.runGh(["pr", "view", selector, "--json", "number,title,url,headRefName,headRefOid,baseRefName,state"], options);
		if (result.exitCode !== 0) {
			if (isLookupMiss(result)) return { type: "miss", stderr: result.stderr ?? "no PR found", returncode: result.exitCode };
			return { type: "failure", failure: failureFromProcess(result) };
		}
		const parseResult = parseJson(result.stdout, prSummarySchema);
		if (parseResult.type === "failure") return parseResult;
		return { type: "found", pr: normalizePrSummary(parseResult.value) };
	}

	private async runGh(args: readonly string[], options: GatewayOptions): Promise<ProcessResult> {
		return await this.runProcess({ command: "gh", args, cwd: options.cwd, env: options.env, timeout: GH_TIMEOUT_MS });
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

	async getWorkTreeRoot(options: GatewayOptions): Promise<WorkTreeRootResult> {
		// Keep this pr-address gateway local instead of delegating to @asdl/core/git.optionalRepoRoot:
		// optionalRepoRoot collapses git failures into missing, but the classification-file safety guard
		// must preserve inside | outside | failure to avoid treating unexpected git failures as safe.
		const result = await this.runProcess({ command: "git", args: ["rev-parse", "--show-toplevel"], cwd: options.cwd, env: options.env, timeout: GIT_TIMEOUT_MS });
		if (result.exitCode === 0) return { type: "inside", root: result.stdout.trim() };
		// git exits 128 with "not a git repository" outside any work tree.
		if (result.exitCode === 128) return { type: "outside" };
		return { type: "failure", failure: failureFromProcess(result) };
	}

	async getBranchHeadOid(branch: string, options: GatewayOptions): Promise<BranchHeadOidResult> {
		const result = await this.runProcess({ command: "git", args: ["rev-parse", "--verify", `${branch}^{commit}`], cwd: options.cwd, env: options.env, timeout: GIT_TIMEOUT_MS });
		if (result.exitCode === 0) return { type: "found", oid: result.stdout.trim() };
		if (result.exitCode === 128) return { type: "missing", stderr: result.stderr ?? result.stdout ?? "branch not found", returncode: result.exitCode };
		return { type: "failure", failure: failureFromProcess(result) };
	}

	async getCommitChangedFiles(commitSha: string, options: GatewayOptions): Promise<CommitChangedFilesResult> {
		const trimmed = commitSha.trim();
		if (trimmed === "") return { type: "failure", failure: { stdout: "", stderr: "commit sha must be non-empty", returncode: 2 } };
		const result = await this.runProcess({ command: "git", args: ["diff-tree", "--no-commit-id", "--name-only", "-r", trimmed], cwd: options.cwd, env: options.env, timeout: GIT_TIMEOUT_MS });
		if (result.exitCode !== 0) return { type: "failure", failure: failureFromProcess(result) };
		return { type: "ok", files: result.stdout.split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== "") };
	}

	async getRestructuredFiles(baseRefName: string, options: GatewayOptions): Promise<GatewayResult<readonly RestructuredFile[]>> {
		const result = await this.runProcess({ command: "git", args: ["diff", "--name-status", "-M", "-C", `origin/${baseRefName}...HEAD`], cwd: options.cwd, env: options.env, timeout: GIT_TIMEOUT_MS });
		if (result.exitCode !== 0) return { type: "failure", failure: failureFromProcess(result) };
		return { type: "ok", value: parseRestructuredFiles(result.stdout) };
	}
}

export async function runProcess(request: ProcessRequest): Promise<ProcessResult> {
	const result = await runCommand(request.command, request.args, {
		cwd: request.cwd,
		...(request.env === undefined ? {} : { env: request.env }),
		...(request.timeout === undefined ? {} : { timeout: request.timeout }),
	});
	return { stdout: result.stdout, stderr: result.stderr, exitCode: result.code };
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
		return { type: "failure", failure: { stdout: text, stderr: jsonErrorMessage(error), returncode: 0 } };
	}
	const result = schema.safeParse(parsed);
	if (!result.success) return { type: "failure", failure: { stdout: text, stderr: z.prettifyError(result.error), returncode: 0 } };
	return { type: "ok", value: result.data };
}

function parseGraphqlJson<T>(text: string, schema: z.ZodType<T>): GatewayResult<T> {
	const base = parseJson(text, ghGraphqlErrorsSchema);
	if (base.type === "failure") return base;
	if (base.value.errors !== undefined && base.value.errors.length > 0) return { type: "failure", failure: { stdout: text, stderr: JSON.stringify(base.value.errors), returncode: 0 } };
	return parseJson(text, schema);
}

function parseRestructuredFiles(stdout: string): RestructuredFile[] {
	const files: RestructuredFile[] = [];
	for (const line of stdout.split("\n")) {
		if (line.trim() === "") continue;
		const columns = line.split("\t");
		const status = columns[0] ?? "";
		if (!(status.startsWith("R") || status.startsWith("C"))) continue;
		const oldPath = columns[1] ?? null;
		const newPath = columns[2] ?? columns[1] ?? "";
		files.push({ status, old_path: oldPath, new_path: newPath, similarity: similarity(status) });
	}
	return files;
}

function similarity(status: string): number | null {
	const numeric = Number(status.slice(1));
	return Number.isInteger(numeric) ? numeric : null;
}

function failureFromProcess(result: ProcessResult): GatewayFailure {
	return { stdout: result.stdout, stderr: result.stderr, returncode: result.exitCode };
}

function jsonErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}
