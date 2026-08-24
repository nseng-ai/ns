import type {
	AgentEndContext,
	CommandDefinition,
	ExtensionAPI,
	SessionStartContext,
	SessionStartEventLike,
} from "@nseng-ai/extension-kit/pi-types";
import { createCliHerdrGateway } from "@nseng-ai/herdr/api";
import { RealGitGateway } from "@nseng-ai/foundation/git";
import { optionalEntries, optionalEntry } from "@nseng-ai/foundation/primitives";
import { HERDR_COMMAND_NAMES } from "@nseng-ai/herdr/api";
import type {
	HandoffExtensionAPI,
	HandoffPromptCreateIntegration,
} from "@nseng-ai/pi-ns-handoffs/handoff-launch";
import { definePiSurfaceParity } from "@nseng-ai/pi-runtime/parity/extension";
import type { CommandContext } from "@nseng-ai/pi-runtime/runtime/extension-types";
import { createNodeEffectiveProjectConfig } from "@nseng-ai/sdk/project-config";

import {
	createHerdrSidebarControllerWithPiWiring,
	registerHerdrSidebarCommands,
} from "./sidebar.ts";
import { registerHerdrImplPromptBootstrap } from "./impl-prompt-bootstrap.ts";
import {
	registerHerdrPromptSpaceImplCommand,
	registerHerdrPromptTabImplCommand,
} from "./impl-prompt.ts";
import { registerHerdrSessionImplCommands } from "./impl-session.ts";
import { registerHerdrPlanSpaceImplCommand, registerHerdrPlanTabImplCommand } from "./impl-plan.ts";
import { registerHerdrHandoffTab } from "./handoff-tab.ts";
import { registerHerdrNewSpaceCommand } from "./new-space.ts";
import { registerHerdrSpaceGoalCommand } from "./space-goal.ts";
import { registerHerdrNewTabCommand, registerHerdrTabGoalCommand } from "./tab.ts";
import type { HerdrPiContext } from "./context.ts";
import { createHerdrPiCommandApi } from "./pi-command-api.ts";

export const herdrParity = definePiSurfaceParity(
	HERDR_COMMAND_NAMES.map((surface) => ({
		kind: "command" as const,
		surface,
		workflow: `Run the ${surface} Herdr workflow`,
		parity: "FULL" as const,
		cli: surface === "ns:herdr:tab:handoff" ? "ns herdr exec handoff-tab launch" : "ns herdr",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@nseng-ai/pi-ns-herdr",
		sourceModule: "herdr",
		notes:
			surface === "ns:herdr:tab:handoff"
				? "Optional registration composes the Handoffs host launch interface and the hidden durable-reference Herdr command."
				: "Pi owns interaction and presentation while @nseng-ai/herdr/api owns Herdr resource mechanics.",
	})),
);

export type HandoffIntegrationLoader = () => Promise<{
	createHandoffLaunchIntegration(pi: HandoffExtensionAPI): HandoffPromptCreateIntegration;
}>;

export function registerHerdrPiExtension(pi: ExtensionAPI): Promise<void>;
export function registerHerdrPiExtension(
	pi: HandoffExtensionAPI,
	options?: { loadHandoffIntegration?: HandoffIntegrationLoader },
): Promise<void>;
export async function registerHerdrPiExtension(
	pi: ExtensionAPI | HandoffExtensionAPI,
	options: { loadHandoffIntegration?: HandoffIntegrationLoader } = {},
): Promise<void> {
	const herdrPi = adaptHerdrExtensionApi(pi);
	const commands = createHerdrPiCommandApi(herdrPi);
	const registrationEnv = { ...process.env };
	const git = new RealGitGateway(commands);
	// Registration performs no Graphite or trunk work. Implementation workflows derive
	// the trunk branch from the repository's cached origin/HEAD git fact only after the
	// local-trunk basis is selected (see core/trunk-branch.ts).
	const herdr = createCliHerdrGateway(commands);
	const context: HerdrPiContext = {
		commands,
		git,
		herdr,
		createProjectConfig: ({ cwd, signal }) =>
			createNodeEffectiveProjectConfig({
				cwd,
				env: { ...registrationEnv },
				commands,
				...optionalEntry("signal", signal),
			}),
	};
	const sidebarController = createHerdrSidebarControllerWithPiWiring(herdrPi);
	registerHerdrSidebarCommands(herdrPi, sidebarController);
	registerHerdrSpaceGoalCommand(context);
	registerHerdrPromptSpaceImplCommand(context);
	registerHerdrPromptTabImplCommand(context);
	registerHerdrSessionImplCommands(context);
	registerHerdrPlanSpaceImplCommand(context);
	registerHerdrPlanTabImplCommand(context);
	registerHerdrNewSpaceCommand(context);
	registerHerdrNewTabCommand(context);
	registerHerdrTabGoalCommand(context);
	registerHerdrImplPromptBootstrap(context);

	if (!("registerTool" in pi) || pi.registerTool === undefined) return;
	const load = options.loadHandoffIntegration ?? loadOptionalHandoffIntegration;
	let module: Awaited<ReturnType<HandoffIntegrationLoader>>;
	try {
		module = await load();
	} catch (error) {
		if (isExactOptionalIntegrationAbsence(error)) return;
		throw error;
	}
	registerHerdrHandoffTab(pi, module.createHandoffLaunchIntegration(pi), herdr);
}

async function loadOptionalHandoffIntegration(): ReturnType<HandoffIntegrationLoader> {
	return import("@nseng-ai/pi-ns-handoffs/handoff-launch");
}

export function isExactOptionalIntegrationAbsence(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	const coded = error as Error & { code?: unknown };
	if (coded.code !== "ERR_MODULE_NOT_FOUND" && coded.code !== "MODULE_NOT_FOUND") return false;
	const missingSpecifier =
		/^Cannot find package ['"]([^'"]+)['"]/.exec(error.message)?.[1] ??
		/^Cannot find module ['"]([^'"]+)['"]/.exec(error.message)?.[1];
	return missingSpecifier === "@nseng-ai/pi-ns-handoffs/handoff-launch";
}

function adaptHerdrExtensionApi(pi: ExtensionAPI | HandoffExtensionAPI): ExtensionAPI {
	return {
		on(event, handler): void {
			const herdrPi = pi as ExtensionAPI;
			if (event === "agent_end") {
				const agentEndHandler = handler as (
					event: unknown,
					ctx: AgentEndContext,
				) => Promise<void> | void;
				herdrPi.on("agent_end", agentEndHandler);
				return;
			}
			const sessionStartHandler = handler as (
				event: SessionStartEventLike,
				ctx: SessionStartContext,
			) => Promise<void> | void;
			herdrPi.on("session_start", sessionStartHandler);
		},
		registerCommand(name: string, definition: CommandDefinition): void {
			const metadata = optionalEntries({
				description: definition.description,
				argumentHint: definition.argumentHint,
			});
			if ("registerTool" in pi) {
				pi.registerCommand(name, {
					...metadata,
					handler: async (args, ctx) => definition.handler(args, adaptCommandContext(ctx)),
				});
				return;
			}
			const herdrPi = pi as ExtensionAPI;
			herdrPi.registerCommand(name, { ...metadata, handler: definition.handler });
		},
		async exec(command, args, options) {
			const result = await pi.exec(command, args, options);
			return {
				stdout: result.stdout ?? "",
				stderr: result.stderr ?? "",
				code: result.code,
				killed: result.killed ?? false,
			};
		},
		getCommands: () => pi.getCommands?.() ?? [],
		getAllTools: () => pi.getAllTools?.() ?? [],
		getThinkingLevel: () => pi.getThinkingLevel?.() ?? "medium",
		setThinkingLevel(): void {},
		async setModel(): Promise<boolean> {
			return false;
		},
		sendUserMessage(content: string): void {
			pi.sendUserMessage(content);
		},
		appendEntry(customType, data): void {
			pi.appendEntry(customType, data);
		},
		registerEntryRenderer(customType, renderer): void {
			pi.registerEntryRenderer(customType, renderer);
		},
	};
}

function adaptCommandContext(ctx: CommandContext) {
	return {
		cwd: ctx.cwd,
		...optionalEntries({ hasUI: ctx.hasUI, model: ctx.model }),
		sessionManager: ctx.sessionManager,
		ui: ctx.ui,
		modelRegistry: ctx.modelRegistry ?? { find: () => undefined },
		getSystemPromptOptions: () => ctx.getSystemPromptOptions(),
		waitForIdle: () => ctx.waitForIdle(),
	};
}

export default registerHerdrPiExtension;
