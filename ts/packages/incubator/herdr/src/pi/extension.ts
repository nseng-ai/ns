import { RealGraphiteBranchGateway } from "@nseng-ai/extension-kit/graphite/branch";
import type { CommandDefinition, ExtensionAPI } from "@nseng-ai/extension-kit/pi-types";
import { RealGitGateway } from "@nseng-ai/foundation/git";
import { optionalEntries } from "@nseng-ai/foundation/primitives";
import type {
	HandoffExtensionAPI,
	HandoffPromptCreateIntegration,
} from "@nseng-ai/handoffs/pi/handoff-launch";
import type { CommandContext } from "@nseng-ai/pi/runtime/extension-types";

import { createCliHerdrGateway } from "../core/cli-gateway.ts";
import {
	createHerdrSidebarControllerWithPiWiring,
	registerHerdrSidebarCommands,
} from "./sidebar.ts";
import { registerHerdrPromptSpaceImplCommand } from "./impl-prompt.ts";
import { registerHerdrPlanSpaceImplCommand, registerHerdrPlanTabImplCommand } from "./impl-plan.ts";
import { registerHerdrHandoffTab } from "./handoff-tab.ts";
import { registerHerdrNewSpaceCommand } from "./new-space.ts";
import { registerHerdrSpaceGoalCommand } from "./space-goal.ts";
import { registerHerdrNewTabCommand, registerHerdrTabGoalCommand } from "./tab.ts";
import type { HerdrPiContext } from "./context.ts";
import { createHerdrPiCommandApi } from "./pi-command-api.ts";

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
	const git = new RealGitGateway(commands);
	const graphite = new RealGraphiteBranchGateway(commands);
	// Graphite trunk changes are heavyweight process-wide reconfiguration. Resolve it once at
	// startup and treat the result as immutable for this extension lifetime; gateway injection
	// remains the test seam for trunk resolution.
	const trunk = await graphite.trunkBranch({ cwd: process.cwd() });
	if (!trunk.ok) {
		throw new Error(
			`Could not initialize Herdr: failed to resolve Graphite trunk. ${trunk.error.message}`,
		);
	}
	const herdr = createCliHerdrGateway(commands);
	const context: HerdrPiContext = { commands, git, trunkBranch: trunk.branch, herdr };
	const sidebarController = createHerdrSidebarControllerWithPiWiring(herdrPi);
	registerHerdrSidebarCommands(herdrPi, sidebarController);
	registerHerdrSpaceGoalCommand(herdrPi);
	registerHerdrPromptSpaceImplCommand(context);
	registerHerdrPlanSpaceImplCommand(context);
	registerHerdrPlanTabImplCommand(context);
	registerHerdrNewSpaceCommand(context);
	registerHerdrNewTabCommand(context);
	registerHerdrTabGoalCommand(herdrPi);

	if (!("registerTool" in pi) || pi.registerTool === undefined) return;
	const load = options.loadHandoffIntegration ?? loadOptionalHandoffIntegration;
	let module: Awaited<ReturnType<HandoffIntegrationLoader>>;
	try {
		module = await load();
	} catch (error) {
		if (isExactOptionalIntegrationAbsence(error)) return;
		throw error;
	}
	registerHerdrHandoffTab(pi, module.createHandoffLaunchIntegration(pi));
}

async function loadOptionalHandoffIntegration(): ReturnType<HandoffIntegrationLoader> {
	return import("@nseng-ai/handoffs/pi/handoff-launch");
}

export function isExactOptionalIntegrationAbsence(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	const coded = error as Error & { code?: unknown };
	if (coded.code !== "ERR_MODULE_NOT_FOUND" && coded.code !== "MODULE_NOT_FOUND") return false;
	const missingSpecifier =
		/^Cannot find package ['"]([^'"]+)['"]/.exec(error.message)?.[1] ??
		/^Cannot find module ['"]([^'"]+)['"]/.exec(error.message)?.[1];
	return missingSpecifier === "@nseng-ai/handoffs/pi/handoff-launch";
}

function adaptHerdrExtensionApi(pi: ExtensionAPI | HandoffExtensionAPI): ExtensionAPI {
	return {
		on(event, handler): void {
			if (event !== "session_start") return;
			pi.on?.("session_start", handler);
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
	};
}

function adaptCommandContext(ctx: CommandContext) {
	return {
		cwd: ctx.cwd,
		...optionalEntries({ hasUI: ctx.hasUI, model: ctx.model }),
		sessionManager: ctx.sessionManager,
		ui: ctx.ui,
		modelRegistry: ctx.modelRegistry ?? { find: () => undefined },
		waitForIdle: () => ctx.waitForIdle(),
	};
}

export default registerHerdrPiExtension;
