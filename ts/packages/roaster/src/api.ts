import type { ClinkrExit } from "@sdl/clinkr";

import {
	createRealRoasterContext,
	createRoasterRuntime,
	type RoasterRuntime,
	type RoasterRunScope,
} from "./context.ts";
import type { RoasterFailure, RoasterResult } from "./failures.ts";
import { ROASTER_REVIEW_LOG_NAMESPACE, type ReviewLogEntry } from "./gateways/review-log.ts";
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
	runReviewList,
	runReviewLog,
	runRoastSkillList,
	type ReviewListRequest,
	type ReviewListResult,
	type ReviewLogRequest,
	type ReviewLogResult,
	type RoastSkillListRequest,
	type RoastSkillListResult,
} from "./operations/cli-operations.ts";
import {
	runRoasterReview,
	type RunRoasterReviewOutcome,
	type RunRoasterReviewProgress,
	type RunRoasterReviewRequest,
} from "./operations/review-run.ts";

export { ROASTER_REVIEW_LOG_NAMESPACE };
export type {
	LocalDiff,
	ReviewDefinition,
	ReviewExecutionResponse,
	ReviewFinding,
	ReviewFindingsPayload,
	ReviewInputCoverage,
	ReviewListRequest,
	ReviewListResult,
	ReviewLogEntry,
	ReviewLogRequest,
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
	readonly env?: NodeJS.ProcessEnv | Record<string, string | undefined> | undefined;
	readonly signal?: AbortSignal | undefined;
	readonly stdin?: (() => Promise<string>) | undefined;
	readonly stdout?: ((text: string) => void) | undefined;
	readonly stderr?: ((text: string) => void) | undefined;
	/** Inject a prebuilt gateway-injected runtime instead of constructing real adapters. */
	readonly runtime?: RoasterRuntime | undefined;
}

export interface RoasterClient {
	listReviews(request?: Partial<ReviewListRequest>): Promise<RoasterApiResult<ReviewListResult>>;
	listRoastSkills(
		request?: Partial<RoastSkillListRequest>,
	): Promise<RoasterApiResult<RoastSkillListResult>>;
	listReviewLogs(request?: Partial<ReviewLogRequest>): Promise<RoasterApiResult<ReviewLogResult>>;
	/** Runs a review and writes a Roaster review log through the configured review log gateway. */
	runReview(request: RunRoasterReviewRequest): Promise<RunRoasterReviewOutcome>;
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
			return clinkrExitToApiResult(
				await runReviewList(getRuntime(), reviewListRequestWithDefaults(request)),
			);
		},
		async listRoastSkills(_request = {}) {
			return clinkrExitToApiResult(await runRoastSkillList(getRuntime(), {}));
		},
		async listReviewLogs(request = {}) {
			return clinkrExitToApiResult(await runReviewLog(getRuntime(), request));
		},
		async runReview(request) {
			return await runRoasterReview(getRuntime(), request);
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

function clinkrExitToApiResult<T>(exit: ClinkrExit<T>): RoasterApiResult<T> {
	switch (exit.type) {
		case "ok":
			return { ok: true, result: exit.data };
		case "negative":
			return { ok: false, failure: { errorType: "negative", message: exit.message } };
		case "failure":
			return { ok: false, failure: { errorType: exit.errorType, message: exit.message } };
		case "usageError":
			return { ok: false, failure: { errorType: exit.errorType, message: exit.message } };
	}
}
