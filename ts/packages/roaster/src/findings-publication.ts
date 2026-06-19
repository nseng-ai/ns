import {
	buildFailureMachineEnvelopeSchema,
	buildSuccessMachineEnvelopeSchema,
	machineEnvelopeSchema,
} from "@asdl/clinkr";
import { formatZodError } from "@asdl/core/primitives";
import { z } from "zod";

import type { RoasterGitHub } from "./context.ts";
import {
	parseFindingsCommentBody,
	preserveActivityLog,
	renderFindingsComment,
	type FindingsPayload,
} from "./findings-comment.ts";
export {
	extractInlineMarkers,
	inlineMarkerForFinding,
	parseFindingsCommentBody,
	preserveActivityLog,
	renderFindingsComment,
	renderInlineBody,
	summaryMarkerForReview,
} from "./findings-comment.ts";
export type {
	FindingsCommentBodyParseError,
	FindingsCommentBodyParseResult,
	FindingsPayload,
	ParsedFindingsCommentBody,
} from "./findings-comment.ts";
import { postInlineFindings } from "./inline-publication.ts";
import { reviewRunResultSchema, type PostInlineFindingsResult } from "./models.ts";

const BOT_LOGIN = "github-actions[bot]";

const reviewRunSuccessEnvelopeSchema = buildSuccessMachineEnvelopeSchema(reviewRunResultSchema);

const reviewRunFailureEnvelopeSchema = buildFailureMachineEnvelopeSchema({
	errorTypeSchema: z.string().trim().min(1),
});

export interface FindingsPayloadParseError {
	readonly type: "findings_payload_parse_error";
	readonly message: string;
}

export type FindingsPayloadParseResult =
	| { readonly type: "ok"; readonly payload: FindingsPayload }
	| { readonly type: "error"; readonly error: FindingsPayloadParseError };

export function parseFindingsPayloadResult(
	raw: string,
	options: { readonly fallbackReviewName?: string; readonly fallbackBaseRef?: string } = {},
): FindingsPayloadParseResult {
	const data = parseJson(raw);
	if (data.type === "error") return payloadError(data.message);
	if (!machineEnvelopeSchema.safeParse(data.value).success)
		return payloadError("expected a clinkr envelope with top-level 'exit_code'");

	const success = reviewRunSuccessEnvelopeSchema.safeParse(data.value);
	if (success.success) {
		return {
			type: "ok",
			payload: {
				reviewName: success.data.data.reviewName,
				baseRef: success.data.data.baseRef,
				count: success.data.data.count,
				findings: success.data.data.findings,
				inputCoverage: success.data.data.inputCoverage,
				errorType: null,
				errorMessage: null,
			},
		};
	}

	const failure = reviewRunFailureEnvelopeSchema.safeParse(data.value);
	if (failure.success) {
		const identity = fallbackFailureIdentity(options);
		if (identity.type === "error") return payloadError(identity.message);
		return {
			type: "ok",
			payload: {
				reviewName: identity.reviewName,
				baseRef: identity.baseRef,
				count: 0,
				findings: [],
				inputCoverage: null,
				errorType: failure.data.error_type,
				errorMessage: failure.data.message,
			},
		};
	}

	return payloadError(`invalid review-run envelope: ${formatZodError(success.error)}`);
}

export interface PublishFindingsOptions {
	readonly prNumber: number;
	readonly envelope: string;
	readonly runUrl?: string | undefined;
	readonly fallbackReviewName?: string | undefined;
	readonly fallbackBaseRef?: string | undefined;
}

export type PublishFindingsResult =
	| {
			readonly type: "ok";
			readonly inlineStatus: PostInlineFindingsResult;
			readonly summaryAction: "posted" | "updated";
	  }
	| { readonly type: "error"; readonly message: string };

export async function publishFindings(
	ctx: { readonly github: RoasterGitHub },
	options: PublishFindingsOptions,
): Promise<PublishFindingsResult> {
	const parsed = parseFindingsPayloadResult(options.envelope, fallbackPayloadOptions(options));
	if (parsed.type === "error") return publicationError(parsed.error.message);

	const inlineStatus = await postInlineFindings(ctx, parsed.payload, options);
	const renderedBody = renderFindingsComment(parsed.payload, { inlineStatus });
	const parsedBody = parseFindingsCommentBody(renderedBody);
	if (parsedBody.type === "error") return publicationError(parsedBody.error.message);

	const existing = await ctx.github.findPrDiscussionCommentByMarker({
		prNumber: options.prNumber,
		marker: parsedBody.parsed.marker,
		authorLogin: BOT_LOGIN,
	});
	if (existing.type === "error") return publicationError(existing.error.message);

	const nextBody = preserveActivityLog(
		existing.value?.body ?? "",
		parsedBody.parsed.body,
		activityLogEntry(options.runUrl),
	);
	const written =
		existing.value === null
			? await ctx.github.addPrDiscussionComment(options.prNumber, nextBody)
			: await ctx.github.updatePrDiscussionComment(existing.value.id, nextBody);
	if (written.type === "error") return publicationError(written.error.message);

	return {
		type: "ok",
		inlineStatus,
		summaryAction: existing.value === null ? "posted" : "updated",
	};
}

function fallbackPayloadOptions(
	options: Pick<PublishFindingsOptions, "fallbackReviewName" | "fallbackBaseRef">,
): {
	readonly fallbackReviewName?: string;
	readonly fallbackBaseRef?: string;
} {
	return {
		...(options.fallbackReviewName === undefined
			? {}
			: { fallbackReviewName: options.fallbackReviewName }),
		...(options.fallbackBaseRef === undefined ? {} : { fallbackBaseRef: options.fallbackBaseRef }),
	};
}

type FallbackFailureIdentityResult =
	| { readonly type: "ok"; readonly reviewName: string; readonly baseRef: string }
	| { readonly type: "error"; readonly message: string };

function fallbackFailureIdentity(options: {
	readonly fallbackReviewName?: string;
	readonly fallbackBaseRef?: string;
}): FallbackFailureIdentityResult {
	const { fallbackReviewName, fallbackBaseRef } = options;
	if (fallbackReviewName === undefined || fallbackBaseRef === undefined) {
		const missing = [
			...(fallbackReviewName === undefined ? ["--review-name"] : []),
			...(fallbackBaseRef === undefined ? ["--base-ref"] : []),
		];
		return {
			type: "error",
			message: `failed review envelopes require fallback identity: ${missing.join(" and ")}`,
		};
	}
	return { type: "ok", reviewName: fallbackReviewName, baseRef: fallbackBaseRef };
}

function activityLogEntry(runUrl: string | undefined): string {
	const timestamp = new Date().toISOString();
	return runUrl === undefined || runUrl.trim() === "" ? timestamp : `${timestamp} · ${runUrl}`;
}

function publicationError(message: string): PublishFindingsResult {
	return { type: "error", message };
}

type JsonResult =
	| { readonly type: "ok"; readonly value: unknown }
	| { readonly type: "error"; readonly message: string };

function parseJson(raw: string): JsonResult {
	try {
		return { type: "ok", value: JSON.parse(raw) };
	} catch (caught) {
		return {
			type: "error",
			message: `input is not valid JSON: ${caught instanceof Error ? caught.message : String(caught)}`,
		};
	}
}

function payloadError(message: string): FindingsPayloadParseResult {
	return { type: "error", error: { type: "findings_payload_parse_error", message } };
}
