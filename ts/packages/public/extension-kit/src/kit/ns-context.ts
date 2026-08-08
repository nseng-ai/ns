import type { ClinkrInteraction, ConfirmationRequest } from "@nseng-ai/clinkr";
import type { NsExtensionApi } from "@nseng-ai/sdk";

export interface NsClinkrInteractionOptions {
	title: string;
	formatMessage?: (request: ConfirmationRequest) => string;
}

export interface NsCwdEnvJsonInputContext {
	cwd: string;
	env: Record<string, string | undefined>;
	readStructuredRequest(): Promise<string>;
}

/**
 * Adapts ns's callback-style confirmation hook into Clinkr's semantic
 * interaction interface. Clinkr's `createClinkrInteraction` owns terminal
 * line-reading prompts; this helper is the sanctioned bridge for hosts that
 * already expose `NsExtensionApi.confirm` instead of raw stdin/stderr.
 */
export function createNsClinkrInteraction(
	ctx: NsExtensionApi,
	options: NsClinkrInteractionOptions,
): ClinkrInteraction {
	const confirmPrompt = ctx.confirm;
	if (confirmPrompt === undefined) {
		return {
			confirm: async () => ({ type: "aborted" as const }),
			isInteractive: () => false,
		};
	}
	return {
		confirm: async (request) => {
			const approved = await confirmPrompt(
				options.title,
				formatNsConfirmationMessage(options, request),
				{
					defaultAnswer: request.defaultAnswer,
				},
			);
			return approved ? { type: "confirmed" } : { type: "declined" };
		},
		isInteractive: () => true,
	};
}

/**
 * Builds the common ns exec context shape for commands whose ns-host entry
 * receives cwd/env and finite JSON request input from `NsExtensionApi`.
 */
export function createNsCwdEnvJsonInputContext(ctx: NsExtensionApi): NsCwdEnvJsonInputContext {
	if (ctx.readStructuredRequest === undefined) {
		throw new Error("ns JSON input context requires readStructuredRequest");
	}
	return {
		cwd: ctx.cwd,
		env: ctx.env,
		readStructuredRequest: ctx.readStructuredRequest,
	};
}

function formatNsConfirmationMessage(
	options: NsClinkrInteractionOptions,
	request: ConfirmationRequest,
): string {
	return options.formatMessage?.(request) ?? request.message;
}
