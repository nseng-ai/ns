import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { formatCommand, type CommandExecApi, type ExecOptions } from "@asdl/core/exec";
import { z } from "zod";

import type { GitHubGatewayFailure, RoasterResult } from "../failures.ts";
import type { PRChangedFile, PRDiscussionComment, PRInlineCommentInput, PRReviewComment } from "../models.ts";

const GH_TIMEOUT_MS = 30_000;

const ghAuthorSchema = z.union([z.string(), z.object({ login: z.string().default("") }).loose(), z.null()]);
const ghChangedFileSchema = z
	.object({
		filename: z.string().optional(),
		path: z.string().optional(),
		status: z.string().default("modified"),
		patch: z.string().nullable().optional(),
	})
	.loose();
const ghReviewCommentSchema = z
	.object({
		body: z.string().default(""),
		author: ghAuthorSchema.optional(),
		user: ghAuthorSchema.optional(),
	})
	.loose();
const ghDiscussionCommentSchema = z
	.object({
		id: z.union([z.number().int(), z.string()]).optional(),
		databaseId: z.number().int().optional(),
		body: z.string().default(""),
		author: ghAuthorSchema.optional(),
		user: ghAuthorSchema.optional(),
	})
	.loose();

export interface GitHubGatewayOptions {
	readonly cwd: string;
	readonly env?: NodeJS.ProcessEnv | undefined;
	readonly signal?: AbortSignal | undefined;
}

export interface RoasterGitHubGateway {
	getPrChangedFiles(prNumber: number, options: GitHubGatewayOptions): Promise<RoasterResult<readonly PRChangedFile[]>>;
	getPrReviewComments(prNumber: number, options: GitHubGatewayOptions): Promise<RoasterResult<readonly PRReviewComment[]>>;
	createPrReview(prNumber: number, comments: readonly PRInlineCommentInput[], options: GitHubGatewayOptions): Promise<RoasterResult<void>>;
	findPrDiscussionCommentByMarker(prNumber: number, marker: string, authorLogin: string, options: GitHubGatewayOptions): Promise<RoasterResult<PRDiscussionComment | null>>;
	addPrDiscussionComment(prNumber: number, body: string, options: GitHubGatewayOptions): Promise<RoasterResult<PRDiscussionComment>>;
	updatePrDiscussionComment(commentId: number, body: string, options: GitHubGatewayOptions): Promise<RoasterResult<PRDiscussionComment>>;
}

export class RealRoasterGitHubGateway implements RoasterGitHubGateway {
	private readonly execApi: CommandExecApi;

	constructor(execApi: CommandExecApi) {
		this.execApi = execApi;
	}

	async getPrChangedFiles(prNumber: number, options: GitHubGatewayOptions): Promise<RoasterResult<readonly PRChangedFile[]>> {
		const args = ["api", "--paginate", `repos/{owner}/{repo}/pulls/${prNumber}/files`];
		const result = await this.runGh(args, options);
		if (result.type === "error") return result;
		const parsed = parseJson(result.value.stdout, z.array(ghChangedFileSchema), ["gh", ...args]);
		if (parsed.type === "error") return parsed;
		return {
			type: "ok",
			value: parsed.value.map((file) => ({ path: file.filename ?? file.path ?? "", status: file.status, patch: file.patch ?? null })).filter((file) => file.path !== ""),
		};
	}

	async getPrReviewComments(prNumber: number, options: GitHubGatewayOptions): Promise<RoasterResult<readonly PRReviewComment[]>> {
		const args = ["api", "--paginate", `repos/{owner}/{repo}/pulls/${prNumber}/comments`];
		const result = await this.runGh(args, options);
		if (result.type === "error") return result;
		const parsed = parseJson(result.value.stdout, z.array(ghReviewCommentSchema), ["gh", ...args]);
		if (parsed.type === "error") return parsed;
		return { type: "ok", value: parsed.value.map((comment) => ({ author: normalizeAuthor(comment.user ?? comment.author), body: comment.body })) };
	}

	async createPrReview(prNumber: number, comments: readonly PRInlineCommentInput[], options: GitHubGatewayOptions): Promise<RoasterResult<void>> {
		const input = await writeJsonInput({ event: "COMMENT", comments: comments.map((comment) => ({ path: comment.path, line: comment.line, body: comment.body })) });
		try {
			const args = ["api", "--method", "POST", `repos/{owner}/{repo}/pulls/${prNumber}/reviews`, "--input", input.path];
			const result = await this.runGh(args, options);
			if (result.type === "error") return result;
			return { type: "ok", value: undefined };
		} finally {
			await input.cleanup();
		}
	}

	async findPrDiscussionCommentByMarker(prNumber: number, marker: string, authorLogin: string, options: GitHubGatewayOptions): Promise<RoasterResult<PRDiscussionComment | null>> {
		const comments = await this.getIssueComments(prNumber, options);
		if (comments.type === "error") return comments;
		const comment = comments.value.find((item) => item.author === authorLogin && item.body.includes(marker));
		return { type: "ok", value: comment === undefined ? null : publicDiscussionComment(comment) };
	}

	async addPrDiscussionComment(prNumber: number, body: string, options: GitHubGatewayOptions): Promise<RoasterResult<PRDiscussionComment>> {
		const args = ["api", "--method", "POST", `repos/{owner}/{repo}/issues/${prNumber}/comments`, "-f", `body=${body}`];
		return await this.runDiscussionMutation(args, options);
	}

	async updatePrDiscussionComment(commentId: number, body: string, options: GitHubGatewayOptions): Promise<RoasterResult<PRDiscussionComment>> {
		const args = ["api", "--method", "PATCH", `repos/{owner}/{repo}/issues/comments/${commentId}`, "-f", `body=${body}`];
		return await this.runDiscussionMutation(args, options);
	}

	private async getIssueComments(prNumber: number, options: GitHubGatewayOptions): Promise<RoasterResult<readonly AuthoredDiscussionComment[]>> {
		const args = ["api", "--paginate", `repos/{owner}/{repo}/issues/${prNumber}/comments`];
		const result = await this.runGh(args, options);
		if (result.type === "error") return result;
		const parsed = parseJson(result.value.stdout, z.array(ghDiscussionCommentSchema), ["gh", ...args]);
		if (parsed.type === "error") return parsed;
		return { type: "ok", value: parsed.value.map(normalizeDiscussionComment).filter((comment) => comment.id !== 0) };
	}

	private async runDiscussionMutation(args: readonly string[], options: GitHubGatewayOptions): Promise<RoasterResult<PRDiscussionComment>> {
		const result = await this.runGh(args, options);
		if (result.type === "error") return result;
		const parsed = parseJson(result.value.stdout, ghDiscussionCommentSchema, ["gh", ...args]);
		if (parsed.type === "error") return parsed;
		return { type: "ok", value: publicDiscussionComment(normalizeDiscussionComment(parsed.value)) };
	}

	private async runGh(args: readonly string[], options: GitHubGatewayOptions): Promise<RoasterResult<{ readonly stdout: string }>> {
		let result;
		try {
			result = await this.execApi.exec("gh", [...args], ghExecOptions(options));
		} catch (caught) {
			return error({ type: "github_cli_failed", message: caught instanceof Error ? caught.message : String(caught), command: ["gh", ...args], stderr: "", code: null });
		}
		if (result.code !== 0 || result.killed) {
			return error({ type: "github_cli_failed", message: result.stderr.trim() || `GitHub CLI command failed: ${formatCommand("gh", args)}`, command: ["gh", ...args], stderr: result.stderr, code: result.code });
		}
		return { type: "ok", value: { stdout: result.stdout } };
	}
}

export interface CreatedReviewLogEntry {
	readonly prNumber: number;
	readonly comments: readonly PRInlineCommentInput[];
}

export interface FakeRoasterGitHubGatewayOptions {
	readonly changedFilesByPr?: ReadonlyMap<number, readonly PRChangedFile[]> | undefined;
	readonly reviewCommentsByPr?: ReadonlyMap<number, readonly PRReviewComment[]> | undefined;
	readonly discussionCommentsByPr?: ReadonlyMap<number, readonly (PRDiscussionComment & { readonly author: string })[]> | undefined;
}

export class FakeRoasterGitHubGateway implements RoasterGitHubGateway {
	private readonly changedFilesByPr = new Map<number, PRChangedFile[]>();
	private readonly reviewCommentsByPr = new Map<number, PRReviewComment[]>();
	private readonly discussionCommentsByPr = new Map<number, Array<PRDiscussionComment & { readonly author: string }>>();
	private readonly createdReviewsInternal: CreatedReviewLogEntry[] = [];
	private nextCommentId = 1;

	constructor(options: FakeRoasterGitHubGatewayOptions = {}) {
		copyMapArray(options.changedFilesByPr, this.changedFilesByPr, copyChangedFile);
		copyMapArray(options.reviewCommentsByPr, this.reviewCommentsByPr, copyReviewComment);
		copyMapArray(options.discussionCommentsByPr, this.discussionCommentsByPr, copyAuthoredDiscussionComment);
	}

	async getPrChangedFiles(prNumber: number, _options: GitHubGatewayOptions): Promise<RoasterResult<readonly PRChangedFile[]>> {
		return { type: "ok", value: (this.changedFilesByPr.get(prNumber) ?? []).map(copyChangedFile) };
	}

	async getPrReviewComments(prNumber: number, _options: GitHubGatewayOptions): Promise<RoasterResult<readonly PRReviewComment[]>> {
		return { type: "ok", value: (this.reviewCommentsByPr.get(prNumber) ?? []).map(copyReviewComment) };
	}

	async createPrReview(prNumber: number, comments: readonly PRInlineCommentInput[], _options: GitHubGatewayOptions): Promise<RoasterResult<void>> {
		this.createdReviewsInternal.push({ prNumber, comments: comments.map(copyInlineCommentInput) });
		return { type: "ok", value: undefined };
	}

	async findPrDiscussionCommentByMarker(prNumber: number, marker: string, authorLogin: string, _options: GitHubGatewayOptions): Promise<RoasterResult<PRDiscussionComment | null>> {
		const comment = (this.discussionCommentsByPr.get(prNumber) ?? []).find((item) => item.author === authorLogin && item.body.includes(marker));
		return { type: "ok", value: comment === undefined ? null : { id: comment.id, body: comment.body } };
	}

	async addPrDiscussionComment(prNumber: number, body: string, _options: GitHubGatewayOptions): Promise<RoasterResult<PRDiscussionComment>> {
		const comment = { id: this.nextCommentId, body, author: "github-actions[bot]" };
		this.nextCommentId += 1;
		const comments = this.discussionCommentsByPr.get(prNumber) ?? [];
		comments.push(comment);
		this.discussionCommentsByPr.set(prNumber, comments);
		return { type: "ok", value: { id: comment.id, body: comment.body } };
	}

	async updatePrDiscussionComment(commentId: number, body: string, _options: GitHubGatewayOptions): Promise<RoasterResult<PRDiscussionComment>> {
		for (const [prNumber, comments] of this.discussionCommentsByPr.entries()) {
			const index = comments.findIndex((comment) => comment.id === commentId);
			if (index === -1) continue;
			const existing = comments[index];
			if (existing === undefined) continue;
			comments[index] = { ...existing, body };
			this.discussionCommentsByPr.set(prNumber, comments);
			return { type: "ok", value: { id: commentId, body } };
		}
		return error({ type: "github_response_invalid", message: `No fake discussion comment with id ${commentId}.`, command: [] });
	}

	createdReviews(): readonly CreatedReviewLogEntry[] {
		return this.createdReviewsInternal.map((entry) => ({ prNumber: entry.prNumber, comments: entry.comments.map(copyInlineCommentInput) }));
	}
}

function parseJson<T>(text: string, schema: z.ZodType<T>, command: readonly string[]): RoasterResult<T> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch (caught) {
		return error({ type: "github_json_invalid", message: caught instanceof Error ? caught.message : String(caught), command });
	}
	const result = schema.safeParse(parsed);
	if (!result.success) return error({ type: "github_response_invalid", message: z.prettifyError(result.error), command });
	return { type: "ok", value: result.data };
}

type AuthoredDiscussionComment = PRDiscussionComment & { readonly author: string };

function normalizeAuthor(author: z.infer<typeof ghAuthorSchema> | undefined): string {
	if (typeof author === "string") return author;
	return author?.login ?? "";
}

function normalizeDiscussionComment(comment: z.infer<typeof ghDiscussionCommentSchema>): AuthoredDiscussionComment {
	return { id: numericId(comment.databaseId ?? comment.id), body: comment.body, author: normalizeAuthor(comment.user ?? comment.author) };
}

function numericId(value: string | number | undefined): number {
	if (typeof value === "number") return value;
	if (typeof value === "string") {
		const numeric = Number(value);
		if (Number.isInteger(numeric)) return numeric;
	}
	return 0;
}

interface JsonInputFile {
	readonly path: string;
	cleanup(): Promise<void>;
}

async function writeJsonInput(value: unknown): Promise<JsonInputFile> {
	const directory = await mkdtemp(join(tmpdir(), "roaster-gh-"));
	const path = join(directory, "input.json");
	await writeFile(path, JSON.stringify(value), "utf8");
	return {
		path,
		async cleanup() {
			await rm(directory, { recursive: true, force: true });
		},
	};
}

function ghExecOptions(options: GitHubGatewayOptions): ExecOptions {
	return {
		cwd: options.cwd,
		timeout: GH_TIMEOUT_MS,
		...(options.env === undefined ? {} : { env: options.env }),
		...(options.signal === undefined ? {} : { signal: options.signal }),
	};
}

function error(errorValue: GitHubGatewayFailure): RoasterResult<never> {
	return { type: "error", error: errorValue };
}

function publicDiscussionComment(comment: PRDiscussionComment): PRDiscussionComment {
	return { id: comment.id, body: comment.body };
}

function copyChangedFile(file: PRChangedFile): PRChangedFile {
	return { path: file.path, status: file.status, patch: file.patch };
}

function copyReviewComment(comment: PRReviewComment): PRReviewComment {
	return { author: comment.author, body: comment.body };
}

function copyInlineCommentInput(comment: PRInlineCommentInput): PRInlineCommentInput {
	return { path: comment.path, line: comment.line, body: comment.body };
}

function copyAuthoredDiscussionComment(comment: AuthoredDiscussionComment): AuthoredDiscussionComment {
	return { id: comment.id, body: comment.body, author: comment.author };
}

function copyMapArray<TKey, TValue>(source: ReadonlyMap<TKey, readonly TValue[]> | undefined, target: Map<TKey, TValue[]>, copy: (value: TValue) => TValue): void {
	if (source === undefined) return;
	for (const [key, values] of source.entries()) target.set(key, values.map(copy));
}
