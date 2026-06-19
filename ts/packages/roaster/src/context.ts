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
}

export interface CreateRealRoasterContextOptions {
	readonly execApi?: CommandExecApi | undefined;
	readonly gitGateway?: GitGateway | undefined;
	readonly harness?: HarnessGateway | undefined;
}

export interface RoasterRunEnvironment {
	readonly cwd: string;
	readonly env: NodeJS.ProcessEnv;
	readonly signal?: AbortSignal | undefined;
}

export interface BoundLocalDiffGateway {
	loadDiff(options?: {
		readonly baseRef?: string | null | undefined;
	}): Promise<RoasterResult<LocalDiff>>;
}

export interface BoundReviewCatalogGateway {
	listReviewKeys(): Promise<RoasterResult<ReviewCatalog>>;
	loadReviewSource(options: { readonly key: string }): Promise<RoasterResult<ReviewSource>>;
}

export interface BoundHarnessGateway {
	runReview(request: HarnessReviewRequest): Promise<RoasterResult<ReviewExecutionResponse>>;
}

export interface BoundRoasterGitHubGateway {
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

export interface RoasterRunContext {
	readonly localDiff: BoundLocalDiffGateway;
	readonly reviewCatalog: BoundReviewCatalogGateway;
	readonly github: BoundRoasterGitHubGateway;
	readonly harness: BoundHarnessGateway;
}

export function createRealRoasterContext(
	options: CreateRealRoasterContextOptions = {},
): RoasterContext {
	const execApi = options.execApi ?? new NodeCommandExecApi();
	const gitGateway = options.gitGateway ?? new RealGitGateway(execApi);
	return {
		execApi,
		gitGateway,
		localDiff: new RealLocalDiffGateway({ execApi, gitGateway }),
		reviewCatalog: new RealReviewCatalogGateway({ gitGateway }),
		github: new RealRoasterGitHubGateway(execApi),
		harness: options.harness ?? new RealHarnessGateway({ execApi }),
	};
}

export function bindRoasterContext(
	context: RoasterContext,
	environment: RoasterRunEnvironment,
): RoasterRunContext {
	return {
		localDiff: {
			async loadDiff(options = {}) {
				return await context.localDiff.loadDiff({
					...environmentOptions(environment),
					...(options.baseRef === undefined ? {} : { baseRef: options.baseRef }),
				});
			},
		},
		reviewCatalog: {
			async listReviewKeys() {
				return await context.reviewCatalog.listReviewKeys(catalogOptions(environment));
			},
			async loadReviewSource(options) {
				return await context.reviewCatalog.loadReviewSource({
					...catalogOptions(environment),
					key: options.key,
				});
			},
		},
		harness: {
			async runReview(request) {
				return await context.harness.runReview(request, environmentOptions(environment));
			},
		},
		github: {
			async getPrChangedFiles(prNumber) {
				return await context.github.getPrChangedFiles(prNumber, environmentOptions(environment));
			},
			async getPrReviewComments(prNumber) {
				return await context.github.getPrReviewComments(prNumber, environmentOptions(environment));
			},
			async createPrReview(prNumber, comments) {
				return await context.github.createPrReview(
					prNumber,
					comments,
					environmentOptions(environment),
				);
			},
			async findPrDiscussionCommentByMarker(options) {
				return await context.github.findPrDiscussionCommentByMarker({
					...environmentOptions(environment),
					prNumber: options.prNumber,
					marker: options.marker,
					authorLogin: options.authorLogin,
				});
			},
			async addPrDiscussionComment(prNumber, body) {
				return await context.github.addPrDiscussionComment(
					prNumber,
					body,
					environmentOptions(environment),
				);
			},
			async updatePrDiscussionComment(commentId, body) {
				return await context.github.updatePrDiscussionComment(
					commentId,
					body,
					environmentOptions(environment),
				);
			},
		},
	};
}

function environmentOptions(environment: RoasterRunEnvironment): {
	readonly cwd: string;
	readonly env: NodeJS.ProcessEnv;
	readonly signal?: AbortSignal;
} {
	return {
		cwd: environment.cwd,
		env: environment.env,
		...(environment.signal === undefined ? {} : { signal: environment.signal }),
	};
}

function catalogOptions(environment: RoasterRunEnvironment): {
	readonly cwd: string;
	readonly signal?: AbortSignal;
} {
	return {
		cwd: environment.cwd,
		...(environment.signal === undefined ? {} : { signal: environment.signal }),
	};
}
