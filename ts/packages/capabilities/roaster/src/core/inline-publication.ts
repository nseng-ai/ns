import { formatErrorMessage } from "@ji/core/primitives";

import { environmentOptions, ROASTER_BOT_LOGIN, type RoasterRunScope } from "./context.ts";
import type { FindingsPayload } from "./findings-comment.ts";
import {
	extractInlineMarkers,
	inlineMarkerForFinding,
	renderInlineBody,
} from "./findings-comment.ts";
import type { RoasterGitHubGateway } from "../gateways/github.ts";
import { classifyInlineFindings } from "./inline-commentability.ts";
import type { RoasterResult } from "./failures.ts";
import { type PRInlineCommentInput, type PostInlineFindingsResult } from "./models.ts";

export interface PostInlineFindingsOptions {
	readonly prNumber: number;
	readonly runScope: RoasterRunScope;
}

export async function postInlineFindings(
	ctx: { readonly github: RoasterGitHubGateway },
	payload: FindingsPayload,
	options: PostInlineFindingsOptions,
): Promise<PostInlineFindingsResult> {
	if (payload.errorType !== null || payload.count === 0) return emptyInlineResult();

	const githubOptions = environmentOptions(options.runScope);
	const changedFilesResult = await callGithubOrEmptyResult(() =>
		ctx.github.getPrChangedFiles(options.prNumber, githubOptions),
	);
	if (changedFilesResult.type === "empty") return changedFilesResult.result;

	const reviewCommentsResult = await callGithubOrEmptyResult(() =>
		ctx.github.getPrReviewComments(options.prNumber, githubOptions),
	);
	if (reviewCommentsResult.type === "empty") return reviewCommentsResult.result;

	const classified = classifyInlineFindings(payload.findings, changedFilesResult.value);
	const existingMarkers = new Set(
		reviewCommentsResult.value
			.filter((comment) => comment.author === ROASTER_BOT_LOGIN)
			.flatMap((comment) => extractInlineMarkers(comment.body)),
	);
	const comments: PRInlineCommentInput[] = [];
	let skippedDuplicateCount = 0;

	for (const item of classified.inlineable) {
		const marker = inlineMarkerForFinding(payload.reviewName, item.finding);
		if (existingMarkers.has(marker)) {
			skippedDuplicateCount += 1;
			continue;
		}
		comments.push({
			path: item.target.path,
			line: item.target.line,
			body: renderInlineBody(marker, item.finding, {
				reviewName: payload.reviewName,
				modelProfile: payload.modelProfile,
			}),
		});
	}

	let apiError: string | null = null;
	let postedCount = 0;
	if (comments.length > 0) {
		try {
			const posted = await ctx.github.createPrReview(options.prNumber, comments, githubOptions);
			if (posted.type === "error") apiError = posted.error.message;
			else postedCount = comments.length;
		} catch (caught) {
			apiError = formatErrorMessage(caught);
		}
	}

	return {
		postedCount,
		skippedDuplicateCount,
		fallbackOnlyCount: classified.fallbackOnly.length,
		apiError,
		fallbackOnly: classified.fallbackOnly,
	};
}

type GithubReadOrEmptyResult<T> =
	| { readonly type: "ok"; readonly value: T }
	| { readonly type: "empty"; readonly result: PostInlineFindingsResult };

async function callGithubOrEmptyResult<T>(
	call: () => Promise<RoasterResult<T>>,
): Promise<GithubReadOrEmptyResult<T>> {
	try {
		const result = await call();
		if (result.type === "error") {
			return { type: "empty", result: { ...emptyInlineResult(), apiError: result.error.message } };
		}
		return result;
	} catch (caught) {
		return {
			type: "empty",
			result: { ...emptyInlineResult(), apiError: formatErrorMessage(caught) },
		};
	}
}

function emptyInlineResult(): PostInlineFindingsResult {
	return {
		postedCount: 0,
		skippedDuplicateCount: 0,
		fallbackOnlyCount: 0,
		apiError: null,
		fallbackOnly: [],
	};
}
