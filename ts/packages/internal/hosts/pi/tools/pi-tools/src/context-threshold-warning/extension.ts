import type {
	AgentSettledEvent,
	ContextUsage,
	ExtensionAPI,
	ExtensionUIContext,
} from "@earendil-works/pi-coding-agent";

import { evaluateContextThreshold } from "./model.ts";

const ACKNOWLEDGE_OPTION = "Acknowledge";

export interface ContextThresholdWarningContext {
	readonly hasUI: boolean;
	readonly ui: Pick<ExtensionUIContext, "select">;
	getContextUsage(): ContextUsage | undefined;
}

export type AgentSettledHandler = (
	event: AgentSettledEvent,
	context: ContextThresholdWarningContext,
) => Promise<void> | void;

export interface ContextThresholdWarningHost {
	on(event: "agent_settled", handler: AgentSettledHandler): void;
}

export function registerContextThresholdWarningHost(host: ContextThresholdWarningHost): void {
	let previousTokens: number | undefined;

	host.on("agent_settled", async (_event, ctx) => {
		if (!ctx.hasUI) return;

		const usage = ctx.getContextUsage();
		if (usage === undefined || usage.tokens === null) return;

		const transition = evaluateContextThreshold(previousTokens, usage.tokens);
		previousTokens = transition.nextPreviousTokens;
		if (transition.crossedThreshold === undefined) return;

		const currentUsage = usage.tokens.toLocaleString("en-US");
		const crossedThreshold = transition.crossedThreshold.toLocaleString("en-US");
		try {
			await ctx.ui.select(
				`Context usage is ${currentUsage} tokens; crossed the ${crossedThreshold}-token threshold`,
				[ACKNOWLEDGE_OPTION],
			);
		} catch {
			// A failed or dismissed advisory dialog must not destabilize the host lifecycle.
		}
	});
}

export function registerContextThresholdWarningExtension(pi: ExtensionAPI): void {
	registerContextThresholdWarningHost(pi);
}

export default registerContextThresholdWarningExtension;
