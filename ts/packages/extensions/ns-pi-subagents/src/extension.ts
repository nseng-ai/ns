import { optionalEntry } from "@nseng-ai/foundation/primitives";

import { SubagentFleetRegistry } from "./fleet/registry.ts";
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
import {
	registerSubagentFleetCommand,
	registerSubagentFleetShortcut,
	type CommandRegistrar,
	type RegisterShortcutFunction,
} from "./fleet/navigator.ts";
import type { ReadTextFileDependencies } from "./fleet/read-text-dependencies.ts";

export type NsPiSubagentsExtensionAPI = ExploreExtensionAPI &
	DispatchRunnerSubagentExtensionAPI & {
		registerCommand?: CommandRegistrar;
		registerShortcut?: RegisterShortcutFunction;
	};

export type NsPiSubagentsExtensionOptions = ExploreExtensionOptions &
	DispatchRunnerSubagentExtensionOptions & {
		transcriptViewer?: ReadTextFileDependencies;
	};

export default function nsPiSubagentsExtension(
	pi: NsPiSubagentsExtensionAPI,
	options: NsPiSubagentsExtensionOptions = {},
): void {
	const fleetRegistry = new SubagentFleetRegistry();
	const fleetCommandInput = {
		pi,
		registry: fleetRegistry,
		...optionalEntry("dependencies", options.transcriptViewer),
	};
	registerSubagentFleetCommand(fleetCommandInput);
	registerSubagentFleetShortcut(fleetCommandInput);
	registerExploreTool(pi, { ...options, fleetRegistry });
	registerDispatchRunnerSubagentTool(pi, { ...options, fleetRegistry });
}
