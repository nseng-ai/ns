import {
	buildFailureMachineEnvelopeSchema,
	buildSuccessMachineEnvelopeSchema,
	machineEnvelopeSchema,
	negativeMachineEnvelopeSchema,
} from "@nseng-ai/clinkr";
import { parseJsonInputText } from "@nseng-ai/capability-kit/json-input";
import { formatZodError } from "@nseng-ai/foundation/primitives";
import { resultErr, resultOk, type Result } from "@nseng-ai/foundation/result";
import { z } from "zod";

import {
	environmentOptions,
	REVIEWS_BOT_LOGIN,
	type ReviewsGithubPrFeedbackGateway,
	type ReviewsRunScope,
} from "./context.ts";
import {
	buildFindingsCommentMachineState,
	parseFindingsCommentBody,
	preserveActivityLog,
	renderFindingsComment,
	summaryMarkerForReview,
	type FindingsPayload,
	type LastReviewedHeadState,
} from "./findings-comment.ts";
export {
	buildFindingsCommentMachineState,
	extractInlineMarkers,
	inlineMarkerForFinding,
	parseFindingsCommentBody,
	parseFindingsCommentMachineState,
	preserveActivityLog,
	PRIOR_FINDINGS_STATE_CAP,
	renderFindingsComment,
	renderInlineBody,
	summaryMarkerForReview,
} from "./findings-comment.ts";
export type {
	FindingsCommentBodyParseError,
	FindingsCommentBodyParseResult,
	FindingsCommentMachineState,
	FindingsCommentMachineStateOptions,
	FindingsPayload,
	LastReviewedHeadState,
	ParsedFindingsCommentBody,
	PriorFindingRecord,
	PriorFindingsState,
} from "./findings-comment.ts";
import { postInlineFindings } from "./inline-publication.ts";
import { reviewRunResultSchema, type PostInlineFindingsResult } from "./models.ts";

const reviewRunSuccessEnvelopeSchema = buildSuccessMachineEnvelopeSchema(reviewRunResultSchema);

const reviewRunShellNegativeEnvelopeSchema = z.strictObject({
	status: z.literal("negative"),
	exitCode: z.literal(1),
	message: z.string(),
	data: reviewRunResultSchema,
});

const reviewRunNegativeEnvelopeSchema = negativeMachineEnvelopeSchema.omit({ data: true });

const reviewRunFailureEnvelopeSchema = buildFailureMachineEnvelopeSchema({
	errorTypeSchema: z.string().trim().min(1),
});

export interface FindingsPayloadParseError {
	readonly code: "findings_payload_parse_error";
	readonly message: string;
}

export type FindingsPayloadParseResult = Result<FindingsPayload, FindingsPayloadParseError>;

export function parseFindingsPayloadResult(
	raw: string,
	options: { readonly fallbackReviewName?: string; readonly fallbackBaseRef?: string } = {},
): FindingsPayloadParseResult {
	const data = parseJson(raw);
	if (!data.ok) return payloadError(data.error.message);
	if (!machineEnvelopeSchema.safeParse(data.value).success)
		return payloadError("expected a clinkr envelope with top-level 'status' and 'exitCode'");

	const success = reviewRunSuccessEnvelopeSchema.safeParse(data.value);
	if (success.success) return payloadFromReviewRunResult(success.data.data);

	const negativeResult = reviewRunShellNegativeEnvelopeSchema.safeParse(data.value);
	if (negativeResult.success) return payloadFromReviewRunResult(negativeResult.data.data);

	const negativeEnvelope = reviewRunNegativeEnvelopeSchema.safeParse(data.value);
	if (negativeEnvelope.success) {
		return payloadFromEnvelopeFailure(options, {
			errorType: "negative",
			message: negativeEnvelope.data.message,
		});
	}

	const failure = reviewRunFailureEnvelopeSchema.safeParse(data.value);
	if (failure.success) {
		return payloadFromEnvelopeFailure(options, {
			errorType: failure.data.errorType,
			message: failure.data.message,
		});
	}

	return payloadError(`invalid review-run envelope: ${formatZodError(success.error)}`);
}

export interface PublishFindingsOptions {
	readonly prNumber: number;
	readonly envelope: string;
	readonly runUrl?: string;
	readonly fallbackReviewName?: string;
	readonly fallbackBaseRef?: string;
	readonly lastReviewedHead?: LastReviewedHeadState;
}

export type PublicationFailurePhase =
	| "payload-parse"
	| "comment-body-parse"
	| "summary-lookup"
	| "summary-write";

export type PublicationFailureReason =
	| "invalid-payload"
	| "invalid-comment-body"
	| "github-lookup-failed"
	| "github-write-failed";

export interface SummaryPublicationStatus {
	readonly type: "posted" | "updated";
	readonly marker: string;
}

export interface PublishFindingsSuccess {
	readonly inlineStatus: PostInlineFindingsResult;
	readonly summaryStatus: SummaryPublicationStatus;
}

export interface PublicationError {
	readonly fatalFailurePhase: PublicationFailurePhase;
	readonly reason: PublicationFailureReason;
	readonly message: string;
}

export type PublishFindingsResult =
	| { readonly ok: true; readonly value: PublishFindingsSuccess }
	| { readonly ok: false; readonly error: PublicationError };

export async function publishFindings(
	ctx: { readonly github: ReviewsGithubPrFeedbackGateway; readonly runScope: ReviewsRunScope },
	options: PublishFindingsOptions,
): Promise<PublishFindingsResult> {
	const parsed = parseFindingsPayloadResult(options.envelope, fallbackPayloadOptions(options));
	if (!parsed.ok) return publicationError("payload-parse", "invalid-payload", parsed.error.message);

	const inlineStatus = await postInlineFindings(ctx, parsed.value, {
		prNumber: options.prNumber,
		runScope: ctx.runScope,
	});
	const marker = summaryMarkerForReview(parsed.value.reviewName);
	const existing = await ctx.github.findPrDiscussionCommentByMarker({
		...environmentOptions(ctx.runScope),
		prNumber: options.prNumber,
		marker,
		authorLogin: REVIEWS_BOT_LOGIN,
	});
	if (!existing.ok)
		return publicationError("summary-lookup", "github-lookup-failed", existing.error.message);

	const existingBody = existing.value?.body ?? "";
	const machineState = buildFindingsCommentMachineState({
		existingBody,
		payload: parsed.value,
		lastReviewedHead: options.lastReviewedHead ?? null,
	});
	const renderedBody = renderFindingsComment(parsed.value, { inlineStatus, machineState });
	const parsedBody = parseFindingsCommentBody(renderedBody);
	if (!parsedBody.ok)
		return publicationError("comment-body-parse", "invalid-comment-body", parsedBody.error.message);

	const nextBody = preserveActivityLog(
		existingBody,
		parsedBody.value.body,
		activityLogEntry(options.runUrl),
	);
	const githubOptions = environmentOptions(ctx.runScope);
	const written =
		existing.value === null
			? await ctx.github.addPrDiscussionComment({
					...githubOptions,
					prNumber: options.prNumber,
					body: nextBody,
				})
			: await ctx.github.updatePrDiscussionComment({
					...githubOptions,
					commentId: existing.value.id,
					body: nextBody,
				});
	if (!written.ok)
		return publicationError("summary-write", "github-write-failed", written.error.message);

	return {
		ok: true,
		value: {
			inlineStatus,
			summaryStatus: {
				type: existing.value === null ? "posted" : "updated",
				marker: parsedBody.value.marker,
			},
		},
	};
}

function payloadFromReviewRunResult(
	result: z.infer<typeof reviewRunResultSchema>,
): FindingsPayloadParseResult {
	return {
		ok: true,
		value: {
			reviewName: result.reviewName,
			baseRef: result.baseRef,
			modelProfile: result.modelProfile,
			count: result.count,
			findings: result.findings,
			inputCoverage: result.inputCoverage,
			errorType: null,
			errorMessage: null,
		},
	};
}

function payloadFromEnvelopeFailure(
	options: { readonly fallbackReviewName?: string; readonly fallbackBaseRef?: string },
	failure: { readonly errorType: string; readonly message: string },
): FindingsPayloadParseResult {
	const identity = fallbackFailureIdentity(options);
	if (!identity.ok) return payloadError(identity.error.message);
	return {
		ok: true,
		value: {
			reviewName: identity.value.reviewName,
			baseRef: identity.value.baseRef,
			modelProfile: null,
			count: 0,
			findings: [],
			inputCoverage: null,
			errorType: failure.errorType,
			errorMessage: failure.message,
		},
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
	| {
			readonly ok: true;
			readonly value: { readonly reviewName: string; readonly baseRef: string };
	  }
	| { readonly ok: false; readonly error: { readonly message: string } };

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
			ok: false,
			error: {
				message: `failed review envelopes require fallback identity: ${missing.join(" and ")}`,
			},
		};
	}
	return { ok: true, value: { reviewName: fallbackReviewName, baseRef: fallbackBaseRef } };
}

function activityLogEntry(runUrl: string | undefined): string {
	const timestamp = new Date().toISOString();
	return runUrl === undefined || runUrl.trim() === "" ? timestamp : `${timestamp} · ${runUrl}`;
}

function publicationError(
	fatalFailurePhase: PublicationFailurePhase,
	reason: PublicationFailureReason,
	message: string,
): PublishFindingsResult {
	return { ok: false, error: { fatalFailurePhase, reason, message } };
}

type JsonResult = Result<unknown, { readonly code: "invalid-json"; readonly message: string }>;

function parseJson(raw: string): JsonResult {
	const result = parseJsonInputText({
		text: raw,
		schema: z.unknown(),
		jsonDescription: "review-run envelope JSON",
	});
	if (result.type === "ok") return resultOk(result.value);
	return resultErr({ code: "invalid-json", message: result.error.message });
}

function payloadError(message: string): FindingsPayloadParseResult {
	return { ok: false, error: { code: "findings_payload_parse_error", message } };
}
