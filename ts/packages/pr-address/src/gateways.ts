import { execFile } from "node:child_process";
import process from "node:process";

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

export interface RestructuredFile {
	status: string;
	old_path: string | null;
	new_path: string;
	similarity: number | null;
}

export type GatewayResult<T> = { type: "ok"; value: T } | { type: "failure"; failure: GatewayFailure };
export type PRLookupResult = { type: "found"; pr: PRSummary } | PRLookupMiss | { type: "failure"; failure: GatewayFailure };
export type CurrentBranchResult = { type: "branch"; branch: string } | { type: "detached" } | { type: "failure"; failure: GatewayFailure };

export interface GatewayOptions {
	cwd: string;
	env?: NodeJS.ProcessEnv | undefined;
}

export interface PrAddressGitHubGateway {
	getPrForBranch(branch: string, options: GatewayOptions): Promise<PRLookupResult>;
	getReviews(prNumber: number, options: GatewayOptions): Promise<GatewayResult<readonly PRReview[]>>;
	getReviewThreads(prNumber: number, options: GatewayOptions & { includeResolved: boolean }): Promise<GatewayResult<readonly PRReviewThread[]>>;
	getDiscussionComments(prNumber: number, options: GatewayOptions): Promise<GatewayResult<readonly PRDiscussionComment[]>>;
}

export interface PrAddressGitGateway {
	getCurrentBranch(options: GatewayOptions): Promise<CurrentBranchResult>;
	getRestructuredFiles(baseRefName: string, options: GatewayOptions): Promise<GatewayResult<readonly RestructuredFile[]>>;
}

export interface ProcessRequest {
	command: string;
	args: readonly string[];
	cwd: string;
	env?: NodeJS.ProcessEnv | undefined;
}

export interface ProcessResult {
	stdout: string;
	stderr: string;
	exitCode: number;
}

export type ProcessRunner = (request: ProcessRequest) => Promise<ProcessResult>;

const prSummarySchema = z.object({
	number: z.number().int(),
	title: z.string(),
	url: z.string(),
	headRefName: z.string(),
	baseRefName: z.string(),
	state: z.string(),
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
		databaseId: z.number().int().optional(),
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
		id: z.string(),
		path: z.string().default(""),
		line: z.number().int().nullable().default(null),
		startLine: z.number().int().nullable().optional(),
		isResolved: z.boolean().default(false),
		isOutdated: z.boolean().default(false),
		comments: z.union([z.array(ghReviewCommentSchema), z.object({ nodes: z.array(ghReviewCommentSchema).default([]) }).loose()]).default([]),
	})
	.loose();
const ghDiscussionCommentSchema = z
	.object({
		databaseId: z.number().int().optional(),
		id: z.union([z.number().int(), z.string()]).optional(),
		body: z.string().default(""),
		author: ghAuthorSchema.default(""),
		url: z.string().default(""),
	})
	.loose();

export class RealPrAddressGitHubGateway implements PrAddressGitHubGateway {
	private readonly runProcess: ProcessRunner;

	constructor(options: { runProcess?: ProcessRunner | undefined } = {}) {
		this.runProcess = options.runProcess ?? runProcess;
	}

	async getPrForBranch(branch: string, options: GatewayOptions): Promise<PRLookupResult> {
		const result = await this.runGh(["pr", "view", branch, "--json", "number,title,url,headRefName,baseRefName,state"], options);
		if (result.exitCode !== 0) {
			if (isLookupMiss(result)) return { type: "miss", stderr: result.stderr || "no PR found", returncode: result.exitCode };
			return { type: "failure", failure: failureFromProcess(result) };
		}
		const parseResult = parseJson(result.stdout, prSummarySchema);
		if (parseResult.type === "failure") return parseResult;
		return {
			type: "found",
			pr: {
				number: parseResult.value.number,
				title: parseResult.value.title,
				url: parseResult.value.url,
				head_ref_name: parseResult.value.headRefName,
				base_ref_name: parseResult.value.baseRefName,
				state: parseResult.value.state,
			},
		};
	}

	async getReviews(prNumber: number, options: GatewayOptions): Promise<GatewayResult<readonly PRReview[]>> {
		const result = await this.runGh(["pr", "view", String(prNumber), "--json", "reviews"], options);
		if (result.exitCode !== 0) return { type: "failure", failure: failureFromProcess(result) };
		const parseResult = parseJson(result.stdout, z.object({ reviews: z.array(ghReviewSchema).default([]) }).loose());
		if (parseResult.type === "failure") return parseResult;
		return { type: "ok", value: parseResult.value.reviews.map(normalizeReview) };
	}

	async getReviewThreads(prNumber: number, options: GatewayOptions & { includeResolved: boolean }): Promise<GatewayResult<readonly PRReviewThread[]>> {
		const result = await this.runGh(["pr", "view", String(prNumber), "--json", "reviewThreads"], options);
		if (result.exitCode !== 0) return { type: "failure", failure: failureFromProcess(result) };
		const parseResult = parseJson(result.stdout, z.object({ reviewThreads: z.array(ghReviewThreadSchema).default([]) }).loose());
		if (parseResult.type === "failure") return parseResult;
		const threads = parseResult.value.reviewThreads.map(normalizeReviewThread);
		return { type: "ok", value: options.includeResolved ? threads : threads.filter((thread) => !thread.is_resolved) };
	}

	async getDiscussionComments(prNumber: number, options: GatewayOptions): Promise<GatewayResult<readonly PRDiscussionComment[]>> {
		const result = await this.runGh(["pr", "view", String(prNumber), "--json", "comments"], options);
		if (result.exitCode !== 0) return { type: "failure", failure: failureFromProcess(result) };
		const parseResult = parseJson(result.stdout, z.object({ comments: z.array(ghDiscussionCommentSchema).default([]) }).loose());
		if (parseResult.type === "failure") return parseResult;
		return { type: "ok", value: parseResult.value.comments.map(normalizeDiscussionComment).filter((comment) => comment.id !== 0) };
	}

	private async runGh(args: readonly string[], options: GatewayOptions): Promise<ProcessResult> {
		return await this.runProcess({ command: "gh", args, cwd: options.cwd, env: options.env });
	}
}

export class RealPrAddressGitGateway implements PrAddressGitGateway {
	private readonly runProcess: ProcessRunner;

	constructor(options: { runProcess?: ProcessRunner | undefined } = {}) {
		this.runProcess = options.runProcess ?? runProcess;
	}

	async getCurrentBranch(options: GatewayOptions): Promise<CurrentBranchResult> {
		const result = await this.runProcess({ command: "git", args: ["branch", "--show-current"], cwd: options.cwd, env: options.env });
		if (result.exitCode !== 0) return { type: "failure", failure: failureFromProcess(result) };
		const branch = result.stdout.trim();
		if (branch === "") return { type: "detached" };
		return { type: "branch", branch };
	}

	async getRestructuredFiles(baseRefName: string, options: GatewayOptions): Promise<GatewayResult<readonly RestructuredFile[]>> {
		const result = await this.runProcess({ command: "git", args: ["diff", "--name-status", "-M", "-C", `origin/${baseRefName}...HEAD`], cwd: options.cwd, env: options.env });
		if (result.exitCode !== 0) return { type: "failure", failure: failureFromProcess(result) };
		return { type: "ok", value: parseRestructuredFiles(result.stdout) };
	}
}

export async function runProcess(request: ProcessRequest): Promise<ProcessResult> {
	return await new Promise<ProcessResult>((resolve) => {
		const child = execFile(request.command, [...request.args], { cwd: request.cwd, env: request.env ?? process.env }, (error, stdout, stderr) => {
			if (error !== null && typeof error === "object" && "code" in error && typeof error.code === "number") {
				resolve({ stdout, stderr, exitCode: error.code });
				return;
			}
			resolve({ stdout, stderr, exitCode: error === null ? 0 : 1 });
		});
		child.stdin?.end();
	});
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

function normalizeReviewThread(thread: z.infer<typeof ghReviewThreadSchema>): PRReviewThread {
	const comments = Array.isArray(thread.comments) ? thread.comments : thread.comments.nodes;
	return {
		id: thread.id,
		path: thread.path,
		line: thread.line,
		start_line: thread.startLine ?? null,
		is_resolved: thread.isResolved,
		is_outdated: thread.isOutdated,
		comments: comments.map(normalizeReviewComment).filter((comment) => comment.id !== 0),
	};
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
		author: normalizeAuthor(comment.author),
		url: comment.url,
	};
}

function normalizeAuthor(author: z.infer<typeof ghAuthorSchema>): string {
	if (typeof author === "string") return author;
	return author?.login ?? "";
}

function numericId(value: string | number | undefined): number {
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
