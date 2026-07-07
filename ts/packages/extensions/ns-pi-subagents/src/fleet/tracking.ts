import { optionalEntry } from "@nseng-ai/foundation/primitives";
import type { ToolContext } from "@nseng-ai/pi/runtime/tool-types";

import {
	RunnerSubagentFleetRegistry,
	type RunnerSubagentFleetTaskInput,
} from "../runner-subagents/fleet.ts";
import type {
	RunnerSubagentResult,
	RunnerSubagentUpdate,
} from "../runner-subagents/extension-api.ts";
import { syncSubagentFleetDisplay } from "./display.ts";

export interface SubagentFleetRunTracking {
	markRunning(index: number): void;
	markProgress(index: number, update: RunnerSubagentUpdate): void;
	markDone(index: number, result: RunnerSubagentResult): void;
	dispose(): void;
}

export function trackSubagentFleetRun(input: {
	registry: RunnerSubagentFleetRegistry;
	ctx: ToolContext;
	tasks: readonly RunnerSubagentFleetTaskInput[];
	parentSessionFile: string | undefined;
}): SubagentFleetRunTracking {
	const registry = input.registry;

	const run = registry.startRun(input.tasks, {
		...optionalEntry("parentSessionFile", input.parentSessionFile),
	});
	const unsubscribe = registry.subscribe(() => {
		syncSubagentFleetDisplay(input.ctx, registry.snapshot());
	});
	syncSubagentFleetDisplay(input.ctx, registry.snapshot());

	function taskId(index: number): string | undefined {
		return run.tasks[index]?.id;
	}

	return {
		markRunning(index) {
			registry.markRunning(taskId(index));
		},
		markProgress(index, update) {
			registry.markProgress(taskId(index), update);
		},
		markDone(index, result) {
			registry.markDone(taskId(index), result);
		},
		dispose() {
			unsubscribe();
		},
	};
}
