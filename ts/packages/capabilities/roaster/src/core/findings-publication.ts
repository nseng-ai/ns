import {
	buildFailureMachineEnvelopeSchema,
	buildSuccessMachineEnvelopeSchema,
	machineEnvelopeSchema,
	negativeMachineEnvelopeSchema,
} from "@ns/clinkr";
import { formatErrorMessage, formatZodError } from "@ns/core/primitives";
import { z } from "zod";

import { environmentOptions, ROASTER_BOT_LOGIN, type RoasterRunScope } from "./context.ts";
import type { RoasterGitHubGateway } from "../gateways/github.ts";
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
	| { readonly type: "ok"; readonly value: PublishFindingsSuccess }
	| { readonly type: "error"; readonly error: PublicationError };

export async function publishFindings(
	ctx: { readonly github: RoasterGitHubGateway; readonly runScope: RoasterRunScope },
	options: PublishFindingsOptions,
): Promise<PublishFindingsResult> {
	const parsed = parseFindingsPayloadResult(options.envelope, fallbackPayloadOptions(options));
	if (parsed.type === "error")
		return publicationError("payload-parse", "invalid-payload", parsed.error.message);

	const inlineStatus = await postInlineFindings(ctx, parsed.payload, {
		prNumber: options.prNumber,
		runScope: ctx.runScope,
	});
	const marker = summaryMarkerForReview(parsed.payload.reviewName);
	const existing = await ctx.github.findPrDiscussionCommentByMarker({
		...environmentOptions(ctx.runScope),
		prNumber: options.prNumber,
		marker,
		authorLogin: ROASTER_BOT_LOGIN,
	});
	if (existing.type === "error")
		return publicationError("summary-lookup", "github-lookup-failed", existing.error.message);

	const existingBody = existing.value?.body ?? "";
	const machineState = buildFindingsCommentMachineState({
		existingBody,
		payload: parsed.payload,
		lastReviewedHead: options.lastReviewedHead ?? null,
	});
	const renderedBody = renderFindingsComment(parsed.payload, { inlineStatus, machineState });
	const parsedBody = parseFindingsCommentBody(renderedBody);
	if (parsedBody.type === "error")
		return publicationError("comment-body-parse", "invalid-comment-body", parsedBody.error.message);

	const nextBody = preserveActivityLog(
		existingBody,
		parsedBody.parsed.body,
		activityLogEntry(options.runUrl),
	);
	const githubOptions = environmentOptions(ctx.runScope);
	const written =
		existing.value === null
			? await ctx.github.addPrDiscussionComment(options.prNumber, nextBody, githubOptions)
			: await ctx.github.updatePrDiscussionComment(existing.value.id, nextBody, githubOptions);
	if (written.type === "error")
		return publicationError("summary-write", "github-write-failed", written.error.message);

	return {
		type: "ok",
		value: {
			inlineStatus,
			summaryStatus: {
				type: existing.value === null ? "posted" : "updated",
				marker: parsedBody.parsed.marker,
			},
		},
	};
}

function payloadFromReviewRunResult(
	result: z.infer<typeof reviewRunResultSchema>,
): FindingsPayloadParseResult {
	return {
		type: "ok",
		payload: {
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
	if (identity.type === "error") return payloadError(identity.error.message);
	return {
		type: "ok",
		payload: {
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
			readonly type: "ok";
			readonly value: { readonly reviewName: string; readonly baseRef: string };
	  }
	| { readonly type: "error"; readonly error: { readonly message: string } };

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
			error: {
				message: `failed review envelopes require fallback identity: ${missing.join(" and ")}`,
			},
		};
	}
	return { type: "ok", value: { reviewName: fallbackReviewName, baseRef: fallbackBaseRef } };
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
	return { type: "error", error: { fatalFailurePhase, reason, message } };
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
			message: `input is not valid JSON: ${formatErrorMessage(caught)}`,
		};
	}
}

function payloadError(message: string): FindingsPayloadParseResult {
	return { type: "error", error: { type: "findings_payload_parse_error", message } };
}
