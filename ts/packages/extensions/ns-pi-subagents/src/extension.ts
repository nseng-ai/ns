import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadPiAgentDefinition } from "@nseng-ai/pi/runtime/agent-definition";
import { createPiCommandExecApi, type RawPiExecApi } from "@nseng-ai/pi/shared/command-exec";

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

export type NsPiSubagentsExtensionAPI = Omit<SubagentToolHost, "exec"> &
	RawPiExecApi &
	Pick<ExtensionAPI, "events" | "on"> & {
		registerCommand?: CommandRegistrar;
		registerShortcut?: RegisterShortcutFunction;
	};

export interface NsPiSubagentsExtensionOptions {
	cwd?: string;
	loadAgentDefinition?: typeof loadPiAgentDefinition;
	readGitHead?: ReadGitHead;
	fleetNavigatorDependencies?: ReadTextFileDependencies;
	runtimeAdapters?: readonly SubagentRuntimeAdapter[];
	subprocessRuntime?: SubagentRuntime;
	inProcessSessionFactory?: InProcessSubagentSessionFactory;
}

export default function nsPiSubagentsExtension(
	pi: NsPiSubagentsExtensionAPI,
	options: NsPiSubagentsExtensionOptions = {},
): void {
	const cwd = options.cwd ?? process.cwd();
	const loadDefinition = options.loadAgentDefinition ?? loadPiAgentDefinition;
	const commands = createPiCommandExecApi(pi);
	const subagentToolHost = createSubagentToolHost(pi, commands);
	const fleetRegistry = getOrCreateSubagentFleetRegistry({
		owner: pi.events,
		onSessionStart: (handler) => pi.on("session_start", handler),
		onSessionShutdown: (handler) => pi.on("session_shutdown", handler),
	});
	const readGitHead = options.readGitHead ?? createGitReadHead({ exec: commands });
	const fleetCommandInput = {
		pi,
		registry: fleetRegistry,
		...(options.fleetNavigatorDependencies === undefined
			? {}
			: { dependencies: options.fleetNavigatorDependencies }),
	};
	registerSubagentFleetCommand(fleetCommandInput);
	registerSubagentFleetShortcut(fleetCommandInput);
	const agents = createSubagentAgentRegistry(
		[EXPLORER_AGENT_DESCRIPTOR, TASK_AGENT_DESCRIPTOR],
		(name) => loadDefinition(name, cwd),
	);
	const registration = registerSubagentTool(subagentToolHost, {
		agents,
		fleetRegistry,
		readGitHead,
		loadAgentDefinition: loadDefinition,
		runtimes: createSubagentRuntimeRegistry(
			options.runtimeAdapters ?? defaultRuntimeAdapters(options),
		),
	});
	const doctrine = buildSubagentDelegationDoctrine(registration.doctrineSections);
	if (doctrine !== undefined) {
		pi.on("before_agent_start", (event) => ({
			systemPrompt: `${event.systemPrompt}\n\n${doctrine}`,
		}));
	}
}

function createSubagentToolHost(
	pi: NsPiSubagentsExtensionAPI,
	commands: ReturnType<typeof createPiCommandExecApi>,
): SubagentToolHost {
	return {
		...pi,
		registerTool: pi.registerTool.bind(pi),
		exec: commands.exec,
		...(pi.getThinkingLevel === undefined
			? {}
			: { getThinkingLevel: pi.getThinkingLevel.bind(pi) }),
	};
}

function defaultRuntimeAdapters(
	options: NsPiSubagentsExtensionOptions,
): readonly SubagentRuntimeAdapter[] {
	return [
		{
			kind: "subprocess",
			create: () => ({
				ok: true,
				runtime: options.subprocessRuntime ?? createSubprocessSubagentRuntime(),
			}),
		},
		{
			kind: "in-process",
			create: (ctx) => {
				if (ctx.modelRegistry === undefined) {
					return {
						ok: false,
						diagnostic: "In-process execution requires ToolContext.modelRegistry.",
					};
				}
				return {
					ok: true,
					runtime: createInProcessSubagentRuntime({
						sessionFactory: options.inProcessSessionFactory ?? createPiAgentSessionFactory(),
						modelRegistry: ctx.modelRegistry,
					}),
				};
			},
		},
	];
}
