import { optionalEntry } from "@nseng-ai/foundation/primitives";

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
import { registerAgentsTranscriptCommand } from "./fleet/transcript-viewer.ts";

export type NsPiSubagentsExtensionAPI = ExploreExtensionAPI & DispatchRunnerSubagentExtensionAPI;

export type NsPiSubagentsExtensionOptions = ExploreExtensionOptions &
	DispatchRunnerSubagentExtensionOptions;

export default function nsPiSubagentsExtension(
	pi: NsPiSubagentsExtensionAPI,
	options: NsPiSubagentsExtensionOptions = {},
): void {
	const fleetRegistry = new RunnerSubagentFleetRegistry();
	const fleetCommandInput = {
		pi,
		registry: fleetRegistry,
		...optionalEntry("dependencies", options.transcriptViewer),
	};
	registerAgentsTranscriptCommand(fleetCommandInput);
	registerSubagentFleetCommand(fleetCommandInput);
	registerSubagentFleetShortcut(fleetCommandInput);
	registerExploreTool(pi, { ...options, fleetRegistry });
	registerDispatchRunnerSubagentTool(pi, { ...options, fleetRegistry });
}
