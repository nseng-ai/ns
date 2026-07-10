import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadPiAgentDefinition } from "@nseng-ai/pi/runtime/agent-definition";
import type { ToolContext } from "@nseng-ai/pi/runtime/tool-types";

import { buildSubagentDelegationDoctrine } from "./delegation-doctrine.ts";
import { EXPLORER_AGENT_DESCRIPTOR } from "./agents/explorer.ts";
import { createSubagentAgentRegistry } from "./agents/registry.ts";
import { TASK_AGENT_DESCRIPTOR } from "./agents/task.ts";
import { getOrCreateSubagentFleetRegistry } from "./fleet/provider.ts";
import {
	registerSubagentFleetCommand,
	registerSubagentFleetShortcut,
	type CommandRegistrar,
	type RegisterShortcutFunction,
} from "./fleet/navigator.ts";
import type { ReadTextFileDependencies } from "./fleet/read-text-dependencies.ts";
import { createGitReadWorktreeState } from "./fleet/worktree-state.ts";
import { createGitReadHead, type ReadGitHead } from "./fleet/git-head.ts";
import {
	createInProcessSubagentRuntime,
	type InProcessSubagentSessionFactory,
} from "./runtime/in-process.ts";
import { createPiAgentSessionFactory } from "./runtime/pi-agent-session.ts";
import {
	createSubagentRuntimeRegistry,
	createSubprocessSubagentRuntime,
	type SubagentRuntime,
	type SubagentRuntimeAdapter,
} from "./runtime/seam.ts";
import { registerSubagentTool, type SubagentToolHost } from "./tool/subagent.ts";

export type NsPiSubagentsExtensionAPI = SubagentToolHost &
	Pick<ExtensionAPI, "on"> & {
		registerCommand?: CommandRegistrar;
		registerShortcut?: RegisterShortcutFunction;
	};

export interface NsPiSubagentsExtensionOptions {
	cwd?: string;
	loadAgentDefinition?: typeof loadPiAgentDefinition;
	readGitHead?: ReadGitHead;
	fleetNavigatorDependencies?: ReadTextFileDependencies;
	runtimeAdapters?: (ctx: ToolContext) => readonly SubagentRuntimeAdapter[];
	subprocessRuntime?: SubagentRuntime;
	inProcessSessionFactory?: InProcessSubagentSessionFactory;
}

export default function nsPiSubagentsExtension(
	pi: NsPiSubagentsExtensionAPI,
	options: NsPiSubagentsExtensionOptions = {},
): void {
	const cwd = options.cwd ?? process.cwd();
	const loadDefinition = options.loadAgentDefinition ?? loadPiAgentDefinition;
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
	const agents = createSubagentAgentRegistry(
		[EXPLORER_AGENT_DESCRIPTOR, TASK_AGENT_DESCRIPTOR],
		(name) => loadDefinition(name, cwd),
	);
	const registration = registerSubagentTool(pi, {
		agents,
		fleetRegistry,
		readGitHead,
		loadAgentDefinition: loadDefinition,
		runtimes: (ctx) =>
			createSubagentRuntimeRegistry(
				options.runtimeAdapters?.(ctx) ?? defaultRuntimeAdapters(ctx, options),
			),
	});
	const doctrine = buildSubagentDelegationDoctrine(registration.doctrineSections);
	if (doctrine !== undefined) {
		pi.on("before_agent_start", (event) => ({
			systemPrompt: `${event.systemPrompt}\n\n${doctrine}`,
		}));
	}
}

function defaultRuntimeAdapters(
	ctx: ToolContext,
	options: NsPiSubagentsExtensionOptions,
): readonly SubagentRuntimeAdapter[] {
	return [
		{
			kind: "subprocess",
			create: () => options.subprocessRuntime ?? createSubprocessSubagentRuntime(),
		},
		{
			kind: "in-process",
			create: () => {
				if (ctx.modelRegistry === undefined) {
					return { diagnostic: "In-process execution requires ToolContext.modelRegistry." };
				}
				return createInProcessSubagentRuntime({
					sessionFactory: options.inProcessSessionFactory ?? createPiAgentSessionFactory(),
					modelRegistry: ctx.modelRegistry,
				});
			},
		},
	];
}

function resolveFleetNavigatorDependencies(
	pi: NsPiSubagentsExtensionAPI,
	options: NsPiSubagentsExtensionOptions,
): ReadTextFileDependencies {
	const explicit = options.fleetNavigatorDependencies;
	if (explicit?.readWorktreeState !== undefined) return explicit;
	return { ...(explicit ?? {}), readWorktreeState: createGitReadWorktreeState({ exec: pi }) };
}
