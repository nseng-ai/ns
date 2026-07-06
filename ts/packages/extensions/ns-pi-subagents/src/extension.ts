import { RunnerSubagentFleetRegistry } from "./runner-subagents/fleet.ts";
import {
	registerDispatchRunnerSubagentTool,
	type DispatchRunnerSubagentExtensionAPI,
	type DispatchRunnerSubagentExtensionOptions,
} from "./runner-subagents/extension.ts";
import {
	registerExploreTool,
	type ExploreExtensionAPI,
	type ExploreExtensionOptions,
} from "./explore/extension.ts";
import { registerSubagentFleetCommand, registerSubagentFleetShortcut } from "./fleet/navigator.ts";
import { registerExploreTranscriptCommand } from "./fleet/transcript-viewer.ts";

export type NsPiSubagentsExtensionAPI = ExploreExtensionAPI & DispatchRunnerSubagentExtensionAPI;

export type NsPiSubagentsExtensionOptions = ExploreExtensionOptions &
	DispatchRunnerSubagentExtensionOptions;

export default function nsPiSubagentsExtension(
	pi: NsPiSubagentsExtensionAPI,
	options: NsPiSubagentsExtensionOptions = {},
): void {
	const fleetRegistry = new RunnerSubagentFleetRegistry();
	registerExploreTranscriptCommand({
		pi,
		registry: fleetRegistry,
		...(options.transcriptViewer === undefined ? {} : { dependencies: options.transcriptViewer }),
	});
	registerSubagentFleetCommand({
		pi,
		registry: fleetRegistry,
		...(options.transcriptViewer === undefined ? {} : { dependencies: options.transcriptViewer }),
	});
	registerSubagentFleetShortcut({
		pi,
		registry: fleetRegistry,
		...(options.transcriptViewer === undefined ? {} : { dependencies: options.transcriptViewer }),
	});
	registerExploreTool(pi, { ...options, fleetRegistry });
	registerDispatchRunnerSubagentTool(pi, { ...options, fleetRegistry });
}
