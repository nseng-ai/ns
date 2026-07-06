import { formatErrorMessage } from "@nseng-ai/foundation/primitives";
import type { Result } from "@nseng-ai/foundation/result";
import type {
	GithubPrFeedbackFailure,
	GithubPrInlineCommentInput,
} from "@nseng-ai/capability-kit/github/pr-feedback";

import {
	environmentOptions,
	ROASTER_BOT_LOGIN,
	type ReviewsGithubPrFeedbackGateway,
	type RoasterRunScope,
} from "./context.ts";
import type { FindingsPayload } from "./findings-comment.ts";
import {
	extractInlineMarkers,
	inlineMarkerForFinding,
	renderInlineBody,
} from "./findings-comment.ts";
import { classifyInlineFindings } from "./inline-commentability.ts";
import { type PostInlineFindingsResult } from "./models.ts";

export interface PostInlineFindingsOptions {
	readonly prNumber: number;
	readonly runScope: RoasterRunScope;
}

export async function postInlineFindings(
	ctx: { readonly github: ReviewsGithubPrFeedbackGateway },
	payload: FindingsPayload,
	options: PostInlineFindingsOptions,
): Promise<PostInlineFindingsResult> {
	if (payload.errorType !== null || payload.count === 0) return emptyInlineResult();

	const githubOptions = environmentOptions(options.runScope);
	const changedFilesResult = await readGithubOrEmptyResult(() =>
		ctx.github.getPrChangedFiles({ ...githubOptions, prNumber: options.prNumber }),
	);
	if (changedFilesResult.type === "empty") return changedFilesResult.result;

	const reviewCommentsResult = await readGithubOrEmptyResult(() =>
		ctx.github.getPrReviewComments({ ...githubOptions, prNumber: options.prNumber }),
	);
	if (reviewCommentsResult.type === "empty") return reviewCommentsResult.result;

	const classified = classifyInlineFindings(payload.findings, changedFilesResult.value);
	const existingMarkers = new Set(
		reviewCommentsResult.value
			.filter((comment) => comment.author === ROASTER_BOT_LOGIN)
			.flatMap((comment) => extractInlineMarkers(comment.body)),
	);
	const comments: GithubPrInlineCommentInput[] = [];
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
			const posted = await ctx.github.createPrReview({
				...githubOptions,
				prNumber: options.prNumber,
				comments,
			});
			if (!posted.ok) apiError = posted.error.message;
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
	| { readonly type: "value"; readonly value: T }
	| { readonly type: "empty"; readonly result: PostInlineFindingsResult };

async function readGithubOrEmptyResult<T>(
	call: () => Promise<Result<T, GithubPrFeedbackFailure>>,
): Promise<GithubReadOrEmptyResult<T>> {
	try {
		const result = await call();
		if (!result.ok) {
			return { type: "empty", result: { ...emptyInlineResult(), apiError: result.error.message } };
		}
		return { type: "value", value: result.value };
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
