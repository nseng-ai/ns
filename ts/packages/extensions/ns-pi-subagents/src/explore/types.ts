import type {
	RunnerSubagentContext,
	RunnerSubagentPi,
	RunnerSubagentResult,
	RunnerSubagentUpdate,
	RunnerSubagentUsageMetadata,
} from "@internal/pi-tools/runner-subagents";
import type { ExploreBreadth, ExploreBreadthProfile } from "./contract.ts";
import type { DispatchExplorerSubagentOptions, ExplorerDispatchOutcome } from "./dispatch.ts";
import type { ExploreInput } from "./extension.ts";
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

export type ExploreTaskInputFields = ExploreInput["tasks"][number];

export interface ExploreTaskState {
	input: ExploreTaskInputFields;
	state: "queued" | "running" | "done";
	latestUpdate?: RunnerSubagentUpdate;
	outcome?: ExploreTaskOutcome;
}

export interface ExploreRequest {
	input: Pick<ExploreInput, "breadth" | "tasks">;
	profile: Pick<ExploreBreadthProfile, "maxConcurrency" | "wallClockMs">;
}
