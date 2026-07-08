import { buildSubagentDelegationDoctrine } from "./delegation-doctrine.ts";
import { getOrCreateSubagentFleetRegistry } from "./fleet/provider.ts";
import {
	registerForkedPiAgentTool,
	type ForkedPiAgentExtensionAPI,
	type ForkedPiAgentExtensionOptions,
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

export interface BeforeAgentStartEventLike {
	systemPrompt: string;
}

export type BeforeAgentStartHandler = (
	event: BeforeAgentStartEventLike,
) => { systemPrompt: string } | void | Promise<{ systemPrompt: string } | void>;

export type NsPiSubagentsExtensionAPI = ExploreExtensionAPI &
	ForkedPiAgentExtensionAPI & {
		registerCommand?: CommandRegistrar;
		registerShortcut?: RegisterShortcutFunction;
		on?(event: "before_agent_start", handler: BeforeAgentStartHandler): void;
	};

export type NsPiSubagentsExtensionOptions = ExploreExtensionOptions &
	ForkedPiAgentExtensionOptions & {
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
		dependencies: fleetNavigatorDependencies,
	};
	registerSubagentFleetCommand(fleetCommandInput);
	registerSubagentFleetShortcut(fleetCommandInput);
	const exploreRegistration = registerExploreTool(pi, { ...options, fleetRegistry, readGitHead });
	const forkedPiAgentRegistration = registerForkedPiAgentTool(pi, {
		...options,
		fleetRegistry,
		readGitHead,
	});
	const doctrine = buildSubagentDelegationDoctrine({
		isExploreHealthy: exploreRegistration.isHealthy,
		isForkedPiAgentHealthy: forkedPiAgentRegistration.isHealthy,
	});
	if (doctrine !== undefined) {
		pi.on?.("before_agent_start", (event) => ({
			systemPrompt: `${event.systemPrompt}\n\n${doctrine}`,
		}));
	}
}

function resolveFleetNavigatorDependencies(
	pi: NsPiSubagentsExtensionAPI,
	options: NsPiSubagentsExtensionOptions,
): ReadTextFileDependencies {
	const explicit = options.fleetNavigatorDependencies;
	if (explicit?.readWorktreeState !== undefined) return explicit;
	return {
		...(explicit ?? {}),
		readWorktreeState: createGitReadWorktreeState({ exec: pi }),
	};
}
