import type {
	CommandContext,
	CommandDefinition,
	ExtensionAPI,
} from "@nseng-ai/capability-kit/pi-types";
import { optionalEntries } from "@nseng-ai/foundation/primitives";
import type {
	HandoffExtensionAPI,
	HandoffLaunchIntegration,
} from "@nseng-ai/handoffs/pi/handoff-launch";

import {
	createHerdrSidebarControllerWithPiWiring,
	registerHerdrSidebarCommands,
} from "./sidebar.ts";
import { registerHerdrSlotDispatchPromptCommand } from "./dispatch-prompt.ts";
import { registerHerdrSlotDispatchFromTrunkCommand } from "./dispatch-from-trunk.ts";
import {
	registerHerdrSlotDispatchPlanCommand,
	registerHerdrSurfaceDispatchPlanCommand,
} from "./dispatch-plan.ts";
import { createHerdrPiContext } from "./context.ts";
import { registerHerdrHandoffTab } from "./handoff-tab.ts";
import { registerHerdrNewSpaceCommand } from "./new-space.ts";
import { registerHerdrSlotOpenBranchCommand } from "./open-branch.ts";
import { registerHerdrSpaceGoalCommand } from "./space-goal.ts";

export type HandoffIntegrationLoader = () => Promise<{
	createHandoffLaunchIntegration(pi: HandoffExtensionAPI): HandoffLaunchIntegration;
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
	const context = createHerdrPiContext(herdrPi);
	const sidebarController = createHerdrSidebarControllerWithPiWiring(herdrPi);
	registerHerdrSidebarCommands(herdrPi, sidebarController);
	registerHerdrSpaceGoalCommand(herdrPi);
	registerHerdrSlotDispatchPromptCommand(herdrPi);
	registerHerdrSlotDispatchFromTrunkCommand(herdrPi);
	registerHerdrSlotDispatchPlanCommand(herdrPi);
	registerHerdrSurfaceDispatchPlanCommand(herdrPi);
	registerHerdrSlotOpenBranchCommand(herdrPi);
	registerHerdrNewSpaceCommand(context);

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

function adaptCommandContext(
	ctx: Parameters<Parameters<HandoffExtensionAPI["registerCommand"]>[1]["handler"]>[1],
): CommandContext {
	return {
		cwd: ctx.cwd,
		...optionalEntries({ hasUI: ctx.hasUI, model: ctx.model }),
		ui: ctx.ui,
		modelRegistry: ctx.modelRegistry ?? { find: () => undefined },
		waitForIdle: () => ctx.waitForIdle(),
	};
}

export default registerHerdrPiExtension;
