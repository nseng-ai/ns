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
import { callGithub } from "./github-feedback-failures.ts";
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
	const changedFilesResult = await callGithubOrEmptyResult(
		{ ...githubOptions, prNumber: options.prNumber },
		(params) => ctx.github.getPrChangedFiles(params),
	);
	if (changedFilesResult.type === "empty") return changedFilesResult.result;

	const reviewCommentsResult = await callGithubOrEmptyResult(
		{ ...githubOptions, prNumber: options.prNumber },
		(params) => ctx.github.getPrReviewComments(params),
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
			const posted = await callGithub(
				{ ...githubOptions, prNumber: options.prNumber, comments },
				(params) => ctx.github.createPrReview(params),
			);
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

async function callGithubOrEmptyResult<T, TOptions extends { readonly cwd: string | undefined }>(
	options: TOptions,
	call: (options: TOptions) => Promise<Result<T, GithubPrFeedbackFailure>>,
): Promise<GithubReadOrEmptyResult<T>> {
	try {
		const result = await callGithub(options, call);
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
