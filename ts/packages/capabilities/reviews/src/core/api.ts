import {
	createRealRoasterContext,
	createRoasterRuntime,
	type RoasterRuntime,
	type RoasterRunScope,
} from "./context.ts";
import type { RoasterFailure, RoasterResult } from "./failures.ts";
import type { PublishFindingsResult } from "./findings-publication.ts";
import { ROASTER_REVIEW_LOG_NAMESPACE, type ReviewLogEntry } from "../gateways/review-log.ts";
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
	buildRoastSkillListResult,
	publishFindingsFromRequest,
	recordSameSessionFindings,
	type PublishFindingsRequest,
	type RecordFindingsOutcome,
	type RecordFindingsRequest,
	type ReviewListRequest,
	type ReviewListResult,
	type ReviewLogRequest,
	type ReviewLogResult,
	type RoastSkillListRequest,
	type RoastSkillListResult,
} from "../operations/cli-operations.ts";
import type { ExplicitUndefined } from "@nseng-ai/foundation/primitives";
import {
	runRoasterReview,
	type RunRoasterReviewOutcome,
	type RunRoasterReviewProgress,
	type RunRoasterReviewRequest,
} from "../operations/review-run.ts";

export { ROASTER_REVIEW_LOG_NAMESPACE };
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
	RoastSkillListRequest,
	RoastSkillListResult,
	RoasterFailure,
	RoasterResult,
	RoasterRuntime,
	RoasterRunScope,
	RunRoasterReviewOutcome,
	RunRoasterReviewProgress,
	RunRoasterReviewRequest,
};

export interface RoasterApiFailure {
	readonly errorType: string;
	readonly message: string;
}

export type RoasterApiResult<T> =
	| { readonly ok: true; readonly result: T }
	| { readonly ok: false; readonly failure: RoasterApiFailure };

export interface RoasterClientOptions {
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
	readonly runtime?: RoasterRuntime;
}

export interface RoasterClient {
	listReviews(request?: Partial<ReviewListRequest>): Promise<RoasterApiResult<ReviewListResult>>;
	listRoastSkills(
		request?: Partial<RoastSkillListRequest>,
	): Promise<RoasterApiResult<RoastSkillListResult>>;
	listReviewLogs(request?: Partial<ReviewLogRequest>): Promise<RoasterApiResult<ReviewLogResult>>;
	/** Runs a review and writes a Roaster review log through the configured review log gateway. */
	runReview(request: RunRoasterReviewRequest): Promise<RunRoasterReviewOutcome>;
	/** Records same-session findings from stdin and writes a Roaster review log. */
	recordFindings(request: RecordFindingsRequest): Promise<RecordFindingsOutcome>;
	/** Publishes a Roaster review-run envelope from stdin to GitHub. */
	publishFindings(request: PublishFindingsRequest): Promise<PublishFindingsResult>;
}

export function createRoasterClient(options: RoasterClientOptions): RoasterClient {
	let runtime: RoasterRuntime | null = null;
	function getRuntime(): RoasterRuntime {
		if (runtime !== null) return runtime;
		runtime = options.runtime ?? createRealRuntime(options);
		return runtime;
	}

	return {
		async listReviews(request = {}) {
			return roasterResultToApiResult(
				await buildReviewListResult(getRuntime(), reviewListRequestWithDefaults(request)),
			);
		},
		async listRoastSkills(_request = {}) {
			return roasterResultToApiResult(await buildRoastSkillListResult(getRuntime(), {}));
		},
		async listReviewLogs(request = {}) {
			return roasterResultToApiResult(await buildReviewLogResult(getRuntime(), request));
		},
		async runReview(request) {
			return await runRoasterReview(getRuntime(), request);
		},
		async recordFindings(request) {
			return await recordSameSessionFindings(getRuntime(), request);
		},
		async publishFindings(request) {
			return await publishFindingsFromRequest(getRuntime(), request);
		},
	};
}

function createRealRuntime(options: RoasterClientOptions): RoasterRuntime {
	return createRoasterRuntime(
		createRealRoasterContext({
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

function roasterResultToApiResult<T>(result: RoasterResult<T>): RoasterApiResult<T> {
	if (result.type === "ok") return { ok: true, result: result.value };
	return {
		ok: false,
		failure: { errorType: result.error.type, message: result.error.message },
	};
}
