import {
	createRealReviewsContext,
	createReviewsRuntime,
	type ReviewsRuntime,
	type ReviewsRunScope,
} from "./context.ts";
import type { ReviewFailure, ReviewResult } from "./failures.ts";
import type { PublishFindingsResult } from "./findings-publication.ts";
import { REVIEWS_REVIEW_LOG_NAMESPACE, type ReviewLogEntry } from "../gateways/review-log.ts";
import type {
	LocalDiff,
	ReviewDefinition,
	ReviewExecutionResponse,
	ReviewFinding,
	ReviewFindingsPayload,
	ReviewInputCoverage,
	ReviewRunResult,
	ReviewUsage,
} from "./models.ts";
import {
	buildReviewListResult,
	buildReviewLogResult,
	publishFindingsFromRequest,
	recordSameSessionFindings,
	type PublishFindingsRequest,
	type RecordFindingsOutcome,
	type RecordFindingsRequest,
	type ReviewListRequest,
	type ReviewListResult,
	type ReviewLogRequest,
	type ReviewLogResult,
} from "../operations/cli-operations.ts";
import type { ExplicitUndefined } from "@nseng-ai/foundation/primitives";
import {
	runReviewsReview,
	type RunReviewsReviewOutcome,
	type RunReviewsReviewProgress,
	type RunReviewsReviewRequest,
} from "../operations/review-run.ts";

export { REVIEWS_REVIEW_LOG_NAMESPACE };
export type {
	LocalDiff,
	ReviewDefinition,
	ReviewExecutionResponse,
	ReviewFinding,
	ReviewFindingsPayload,
	ReviewInputCoverage,
	PublishFindingsRequest,
	PublishFindingsResult,
	ReviewListRequest,
	ReviewListResult,
	ReviewLogEntry,
	ReviewLogRequest,
	RecordFindingsOutcome,
	RecordFindingsRequest,
	ReviewLogResult,
	ReviewRunResult,
	ReviewUsage,
	ReviewFailure,
	ReviewResult,
	ReviewsRuntime,
	ReviewsRunScope,
	RunReviewsReviewOutcome,
	RunReviewsReviewProgress,
	RunReviewsReviewRequest,
};

export interface ReviewsClientOptions {
	readonly cwd: string;
	readonly env?: ExplicitUndefined<
		"env-map",
		NodeJS.ProcessEnv | Record<string, string | undefined>
	>;
	readonly signal?: ExplicitUndefined<"abort-signal", AbortSignal>;
	readonly stdin?: () => Promise<string>;
	readonly stdout?: (text: string) => void;
	readonly stderr?: (text: string) => void;
	/** Inject a prebuilt gateway-injected runtime instead of constructing real adapters. */
	readonly runtime?: ReviewsRuntime;
}

export interface ReviewsClient {
	listReviews(request?: Partial<ReviewListRequest>): Promise<ReviewResult<ReviewListResult>>;
	listReviewLogs(request?: Partial<ReviewLogRequest>): Promise<ReviewResult<ReviewLogResult>>;
	/** Runs a review and writes a Reviews review log through the configured review log gateway. */
	runReview(request: RunReviewsReviewRequest): Promise<RunReviewsReviewOutcome>;
	/** Records same-session findings from stdin and writes a Reviews review log. */
	recordFindings(request: RecordFindingsRequest): Promise<RecordFindingsOutcome>;
	/** Publishes a Reviews review-run envelope from stdin to GitHub. */
	publishFindings(request: PublishFindingsRequest): Promise<PublishFindingsResult>;
}

export function createReviewsClient(options: ReviewsClientOptions): ReviewsClient {
	let runtime: ReviewsRuntime | null = null;
	function getRuntime(): ReviewsRuntime {
		if (runtime !== null) return runtime;
		runtime = options.runtime ?? createRealRuntime(options);
		return runtime;
	}

	return {
		async listReviews(request = {}) {
			return await buildReviewListResult(getRuntime(), reviewListRequestWithDefaults(request));
		},
		async listReviewLogs(request = {}) {
			return await buildReviewLogResult(getRuntime(), request);
		},
		async runReview(request) {
			return await runReviewsReview(getRuntime(), request);
		},
		async recordFindings(request) {
			return await recordSameSessionFindings(getRuntime(), request);
		},
		async publishFindings(request) {
			return await publishFindingsFromRequest(getRuntime(), request);
		},
	};
}

function createRealRuntime(options: ReviewsClientOptions): ReviewsRuntime {
	return createReviewsRuntime(
		createRealReviewsContext({
			cwd: options.cwd,
			env: normalizedEnv(options.env),
			stdin: options.stdin ?? (async () => ""),
			stdout: options.stdout ?? (() => undefined),
			stderr: options.stderr ?? (() => undefined),
			...(options.signal === undefined ? {} : { signal: options.signal }),
		}),
	);
}

function normalizedEnv(
	env: NodeJS.ProcessEnv | Record<string, string | undefined> | undefined,
): NodeJS.ProcessEnv {
	if (env === undefined) return process.env;
	return { ...env };
}

function reviewListRequestWithDefaults(request: Partial<ReviewListRequest>): ReviewListRequest {
	return {
		applicable: request.applicable ?? false,
		ci: request.ci ?? false,
		...(request.baseRef === undefined ? {} : { baseRef: request.baseRef }),
	};
}
