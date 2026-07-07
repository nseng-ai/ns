import { optionalEntry } from "@nseng-ai/foundation/primitives";

import { getOrCreateSubagentFleetRegistry } from "./fleet/provider.ts";
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
import { createGitReadWorktreeState } from "./fleet/worktree-state.ts";
import { createGitReadHead } from "./fleet/git-head.ts";

export type NsPiSubagentsExtensionAPI = ExploreExtensionAPI &
	DispatchRunnerSubagentExtensionAPI & {
		registerCommand?: CommandRegistrar;
		registerShortcut?: RegisterShortcutFunction;
	};

export type NsPiSubagentsExtensionOptions = ExploreExtensionOptions &
	DispatchRunnerSubagentExtensionOptions & {
		fleetNavigatorDependencies?: ReadTextFileDependencies;
	};

export default function nsPiSubagentsExtension(
	pi: NsPiSubagentsExtensionAPI,
	options: NsPiSubagentsExtensionOptions = {},
): void {
	const fleetRegistry = getOrCreateSubagentFleetRegistry(pi);
	const readGitHead = options.readGitHead ?? createGitReadHead({ exec: pi });
	const fleetNavigatorDependencies = resolveFleetNavigatorDependencies(pi, options);
	const fleetCommandInput = {
		pi,
		registry: fleetRegistry,
		...optionalEntry("dependencies", fleetNavigatorDependencies),
	};
	registerSubagentFleetCommand(fleetCommandInput);
	registerSubagentFleetShortcut(fleetCommandInput);
	registerExploreTool(pi, { ...options, fleetRegistry, readGitHead });
	registerDispatchRunnerSubagentTool(pi, { ...options, fleetRegistry, readGitHead });
}

function resolveFleetNavigatorDependencies(
	pi: NsPiSubagentsExtensionAPI,
	options: NsPiSubagentsExtensionOptions,
): ReadTextFileDependencies | undefined {
	const explicit = options.fleetNavigatorDependencies;
	if (explicit?.readWorktreeState !== undefined) return explicit;
	return {
		...(explicit ?? {}),
		readWorktreeState: createGitReadWorktreeState({ exec: pi }),
	};
}
