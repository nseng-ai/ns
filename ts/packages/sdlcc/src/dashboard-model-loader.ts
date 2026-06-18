import { parseJsonObject } from "./json-fields.ts";
import { loadStackMapModel, type LoadStackMapModelOptions } from "./stack-map-model-loader.ts";
import type { StackMapModel } from "./stack-map.ts";
import { createDashboardModelFromCmuxTree } from "./dashboard-model.ts";
import type { DashboardModel } from "./dashboard.ts";
import { runRealCommand, type CommandRunner } from "./command-runner.ts";

const COMMAND_TIMEOUT_MS = 10_000;

export interface LoadDashboardModelOptions {
	readonly cwd?: string | undefined;
	readonly runCommand?: CommandRunner | undefined;
	readonly stackMapModel?: StackMapModel | undefined;
}

export async function loadDashboardModel(options: LoadDashboardModelOptions = {}): Promise<DashboardModel> {
	const cwd = options.cwd ?? process.cwd();
	const runCommand = options.runCommand ?? runRealCommand;
	const stackMapModel = options.stackMapModel ?? await loadStackMapModel({ cwd, runCommand } satisfies LoadStackMapModelOptions);
	const result = await runCommand("cmux", ["tree", "--json", "--all"], { cwd, timeout: COMMAND_TIMEOUT_MS });
	if (result.code !== 0) return createDashboardModelFromCmuxTree({ windows: [] }, stackMapModel, [`Could not load cmux dashboard: ${result.stderr.trim() || result.stdout.trim() || `cmux tree exited ${result.code}`}`]);
	const parsed = parseJsonObject(result.stdout, "cmux tree");
	if (parsed.type === "failure") return createDashboardModelFromCmuxTree({ windows: [] }, stackMapModel, [`Could not load cmux dashboard: ${parsed.message}`]);
	return createDashboardModelFromCmuxTree(parsed.data, stackMapModel);
}
