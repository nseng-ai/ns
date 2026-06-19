import { NodeCommandExecApi, type CommandExecApi } from "@asdl/core/exec";
import { RealGitGateway, type GitGateway } from "@asdl/core/git";

import { RealHarnessGateway, type HarnessGateway } from "./gateways/harness.ts";
import { RealRoasterGitHubGateway, type RoasterGitHubGateway } from "./gateways/github.ts";
import { RealLocalDiffGateway, type LocalDiffGateway } from "./gateways/local-diff.ts";
import {
	RealReviewCatalogGateway,
	type ReviewCatalog,
	type ReviewCatalogGateway,
	type ReviewSource,
} from "./gateways/review-catalog.ts";
import type { RoasterResult } from "./failures.ts";
import type {
	HarnessReviewRequest,
	LocalDiff,
	PRChangedFile,
	PRDiscussionComment,
	PRInlineCommentInput,
	PRReviewComment,
	ReviewExecutionResponse,
} from "./models.ts";

export interface RoasterContext {
	readonly execApi: CommandExecApi;
	readonly gitGateway: GitGateway;
	readonly localDiff: LocalDiffGateway;
	readonly reviewCatalog: ReviewCatalogGateway;
	readonly github: RoasterGitHubGateway;
	readonly harness: HarnessGateway;
	readonly cwd: string;
	readonly env: NodeJS.ProcessEnv;
	readonly signal?: AbortSignal | undefined;
	readonly stdin: () => Promise<string>;
	readonly stdout: (text: string) => void;
	readonly stderr: (text: string) => void;
}

export interface CreateRealRoasterContextOptions {
	readonly cwd: string;
	readonly env: NodeJS.ProcessEnv;
	readonly stdin: () => Promise<string>;
	readonly stdout: (text: string) => void;
	readonly stderr: (text: string) => void;
	readonly signal?: AbortSignal | undefined;
	readonly execApi?: CommandExecApi | undefined;
	readonly gitGateway?: GitGateway | undefined;
	readonly harness?: HarnessGateway | undefined;
}

export interface RoasterLocalDiff {
	loadDiff(options?: {
		readonly baseRef?: string | null | undefined;
	}): Promise<RoasterResult<LocalDiff>>;
}

export interface RoasterReviewCatalog {
	listReviewKeys(): Promise<RoasterResult<ReviewCatalog>>;
	loadReviewSource(options: { readonly key: string }): Promise<RoasterResult<ReviewSource>>;
}

export interface RoasterHarness {
	runReview(request: HarnessReviewRequest): Promise<RoasterResult<ReviewExecutionResponse>>;
}

export interface RoasterGitHub {
	getPrChangedFiles(prNumber: number): Promise<RoasterResult<readonly PRChangedFile[]>>;
	getPrReviewComments(prNumber: number): Promise<RoasterResult<readonly PRReviewComment[]>>;
	createPrReview(
		prNumber: number,
		comments: readonly PRInlineCommentInput[],
	): Promise<RoasterResult<void>>;
	findPrDiscussionCommentByMarker(options: {
		readonly prNumber: number;
		readonly marker: string;
		readonly authorLogin: string;
	}): Promise<RoasterResult<PRDiscussionComment | null>>;
	addPrDiscussionComment(
		prNumber: number,
		body: string,
	): Promise<RoasterResult<PRDiscussionComment>>;
	updatePrDiscussionComment(
		commentId: number,
		body: string,
	): Promise<RoasterResult<PRDiscussionComment>>;
}

export interface RoasterRuntime {
	readonly localDiff: RoasterLocalDiff;
	readonly reviewCatalog: RoasterReviewCatalog;
	readonly github: RoasterGitHub;
	readonly harness: RoasterHarness;
	readonly stdin: () => Promise<string>;
	readonly stderr: (text: string) => void;
}

export function createRealRoasterContext(options: CreateRealRoasterContextOptions): RoasterContext {
	const execApi = options.execApi ?? new NodeCommandExecApi();
	const gitGateway = options.gitGateway ?? new RealGitGateway(execApi);
	return {
		execApi,
		gitGateway,
		localDiff: new RealLocalDiffGateway({ execApi, gitGateway }),
		reviewCatalog: new RealReviewCatalogGateway({ gitGateway }),
		github: new RealRoasterGitHubGateway(execApi),
		harness: options.harness ?? new RealHarnessGateway({ execApi }),
		cwd: options.cwd,
		env: options.env,
		...(options.signal === undefined ? {} : { signal: options.signal }),
		stdin: options.stdin,
		stdout: options.stdout,
		stderr: options.stderr,
	};
}

export function createRoasterRuntime(context: RoasterContext): RoasterRuntime {
	return {
		stdin: context.stdin,
		stderr: context.stderr,
		localDiff: {
			async loadDiff(options = {}) {
				return await context.localDiff.loadDiff({
					...environmentOptions(context),
					...(options.baseRef === undefined ? {} : { baseRef: options.baseRef }),
				});
			},
		},
		reviewCatalog: {
			async listReviewKeys() {
				return await context.reviewCatalog.listReviewKeys(catalogOptions(context));
			},
			async loadReviewSource(options) {
				return await context.reviewCatalog.loadReviewSource({
					...catalogOptions(context),
					key: options.key,
				});
			},
		},
		harness: {
			async runReview(request) {
				return await context.harness.runReview(request, environmentOptions(context));
			},
		},
		github: {
			async getPrChangedFiles(prNumber) {
				return await context.github.getPrChangedFiles(prNumber, environmentOptions(context));
			},
			async getPrReviewComments(prNumber) {
				return await context.github.getPrReviewComments(prNumber, environmentOptions(context));
			},
			async createPrReview(prNumber, comments) {
				return await context.github.createPrReview(
					prNumber,
					comments,
					environmentOptions(context),
				);
			},
			async findPrDiscussionCommentByMarker(options) {
				return await context.github.findPrDiscussionCommentByMarker({
					...environmentOptions(context),
					prNumber: options.prNumber,
					marker: options.marker,
					authorLogin: options.authorLogin,
				});
			},
			async addPrDiscussionComment(prNumber, body) {
				return await context.github.addPrDiscussionComment(
					prNumber,
					body,
					environmentOptions(context),
				);
			},
			async updatePrDiscussionComment(commentId, body) {
				return await context.github.updatePrDiscussionComment(
					commentId,
					body,
					environmentOptions(context),
				);
			},
		},
	};
}

function environmentOptions(context: RoasterContext): {
	readonly cwd: string;
	readonly env: NodeJS.ProcessEnv;
	readonly signal?: AbortSignal;
} {
	return {
		cwd: context.cwd,
		env: context.env,
		...(context.signal === undefined ? {} : { signal: context.signal }),
	};
}

function catalogOptions(context: RoasterContext): {
	readonly cwd: string;
	readonly signal?: AbortSignal;
} {
	return {
		cwd: context.cwd,
		...(context.signal === undefined ? {} : { signal: context.signal }),
	};
}
