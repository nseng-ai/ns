import type {
	RunnerSubagentContext,
	RunnerSubagentPi,
	RunnerSubagentResult,
	RunnerSubagentUpdate,
	RunnerSubagentUsageMetadata,
} from "../runner-subagents/index.ts";
import type { ExploreBreadth, ExploreBreadthProfile } from "./contract.ts";
import type { DispatchExplorerSubagentOptions, ExplorerDispatchOutcome } from "./dispatch.ts";
import type { ExploreInput, ExploreTaskInput } from "./input.ts";
import type { ExplorerLaunchPlan } from "./model-policy.ts";

export type ExploreDispatchFunction = (
	pi: RunnerSubagentPi,
	ctx: RunnerSubagentContext,
	intent: DispatchExplorerSubagentOptions,
) => Promise<ExplorerDispatchOutcome>;

export type ExploreToolStatus =
	| "completed"
	| "partial"
	| "failed"
	| "cancelled"
	| "configuration-error";

export interface ExploreTaskDetails {
	index: number;
	title: string;
	status: RunnerSubagentResult["status"] | "configuration-error";
	elapsedMs?: number;
	sessionFile?: string;
	launchPlan?: ExplorerLaunchPlan;
	failover?: ExplorerDispatchOutcome["failover"];
	usage?: RunnerSubagentUsageMetadata;
	finalTextChars?: number;
	isFinalTextTruncated?: boolean;
	diagnostic?: string;
}

export interface ExploreToolDetails {
	status: ExploreToolStatus;
	breadth: ExploreBreadth;
	taskCount: number;
	maxConcurrency: number;
	wallClockMs: number;
	tasks: ExploreTaskDetails[];
}

export interface ExploreTaskOutcome {
	index: number;
	title: string;
	result: RunnerSubagentResult;
	launchPlan?: ExplorerLaunchPlan;
	failover?: ExplorerDispatchOutcome["failover"];
}

export interface ExploreTaskState {
	input: ExploreTaskInput;
	state: "queued" | "running" | "done";
	latestUpdate?: RunnerSubagentUpdate;
	outcome?: ExploreTaskOutcome;
}

export interface ExploreRequest {
	input: Pick<ExploreInput, "breadth" | "tasks">;
	profile: Pick<ExploreBreadthProfile, "maxConcurrency" | "wallClockMs">;
}
