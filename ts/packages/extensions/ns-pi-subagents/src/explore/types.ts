import type { ToolResult } from "@nseng-ai/pi/runtime/tool-types";

import type {
	RunnerSubagentContext,
	RunnerSubagentPi,
	RunnerSubagentResult,
	RunnerSubagentUpdate,
	RunnerSubagentUsageMetadata,
} from "@internal/pi-tools/runner-subagents";
import type { ExploreBreadth } from "./contract.ts";
import type { DispatchExplorerSubagentOptions, ExplorerDispatchOutcome } from "./dispatch.ts";
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

export interface ExploreTaskInputFields {
	title: string;
	prompt: string;
}

export interface ExploreTaskState {
	input: ExploreTaskInputFields;
	state: "queued" | "running" | "done";
	latestUpdate?: RunnerSubagentUpdate;
	outcome?: ExploreTaskOutcome;
}

export interface ExploreRequest {
	input: {
		breadth: ExploreBreadth;
		tasks: readonly ExploreTaskInputFields[];
	};
	profile: {
		maxConcurrency: number;
		wallClockMs: number;
	};
}

export type ExploreUpdateCallback = (update: Partial<ToolResult>) => void;
