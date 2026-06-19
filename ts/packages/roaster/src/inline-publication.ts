import type { RoasterGitHub } from "./context.ts";
import type { FindingsPayload } from "./findings-comment.ts";
import {
	extractInlineMarkers,
	inlineMarkerForFinding,
	renderInlineBody,
} from "./findings-comment.ts";
import { classifyInlineFindings } from "./inline-commentability.ts";
import { type PRInlineCommentInput, type PostInlineFindingsResult } from "./models.ts";

const BOT_LOGIN = "github-actions[bot]";

export interface PostInlineFindingsOptions {
	readonly prNumber: number;
}

export async function postInlineFindings(
	ctx: { readonly github: RoasterGitHub },
	payload: FindingsPayload,
	options: PostInlineFindingsOptions,
): Promise<PostInlineFindingsResult> {
	if (payload.errorType !== null || payload.count === 0) return emptyInlineResult();

	let changedFilesResult: Awaited<ReturnType<RoasterGitHub["getPrChangedFiles"]>>;
	try {
		changedFilesResult = await ctx.github.getPrChangedFiles(options.prNumber);
	} catch (caught) {
		return { ...emptyInlineResult(), apiError: caughtMessage(caught) };
	}
	if (changedFilesResult.type === "error") {
		return { ...emptyInlineResult(), apiError: changedFilesResult.error.message };
	}

	let reviewCommentsResult: Awaited<ReturnType<RoasterGitHub["getPrReviewComments"]>>;
	try {
		reviewCommentsResult = await ctx.github.getPrReviewComments(options.prNumber);
	} catch (caught) {
		return { ...emptyInlineResult(), apiError: caughtMessage(caught) };
	}
	if (reviewCommentsResult.type === "error") {
		return { ...emptyInlineResult(), apiError: reviewCommentsResult.error.message };
	}

	const classified = classifyInlineFindings(payload.findings, changedFilesResult.value);
	const existingMarkers = new Set(
		reviewCommentsResult.value
			.filter((comment) => comment.author === BOT_LOGIN)
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
			body: renderInlineBody(marker, item.finding, { reviewName: payload.reviewName }),
		});
	}

	let apiError: string | null = null;
	let postedCount = 0;
	if (comments.length > 0) {
		try {
			const posted = await ctx.github.createPrReview(options.prNumber, comments);
			if (posted.type === "error") apiError = posted.error.message;
			else postedCount = comments.length;
		} catch (caught) {
			apiError = caughtMessage(caught);
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

function emptyInlineResult(): PostInlineFindingsResult {
	return {
		postedCount: 0,
		skippedDuplicateCount: 0,
		fallbackOnlyCount: 0,
		apiError: null,
		fallbackOnly: [],
	};
}

function caughtMessage(caught: unknown): string {
	return caught instanceof Error ? caught.message : String(caught);
}
