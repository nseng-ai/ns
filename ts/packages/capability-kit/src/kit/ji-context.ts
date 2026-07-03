import type { ClinkrInteraction, ConfirmationRequest } from "@ji/clinkr";
import type { SdlExtensionApi } from "@ji/kernel/sdk";

export interface SdlClinkrInteractionOptions {
	title: string;
	formatMessage?: (request: ConfirmationRequest) => string;
}

export interface SdlCwdEnvStdinContext {
	cwd: string;
	env: Record<string, string | undefined>;
	stdin(): Promise<string>;
}

/**
 * Adapts SDL's callback-style confirmation hook into Clinkr's semantic
 * interaction interface. Clinkr's `createClinkrInteraction` owns terminal
 * line-reading prompts; this helper is the sanctioned bridge for hosts that
 * already expose `SdlExtensionApi.confirm` instead of raw stdin/stderr.
 */
export function createSdlClinkrInteraction(
	ctx: SdlExtensionApi,
	options: SdlClinkrInteractionOptions,
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
				formatSdlConfirmationMessage(options, request),
			);
			return approved ? { type: "confirmed" } : { type: "declined" };
		},
		isInteractive: () => true,
	};
}

/**
 * Builds the common SDL exec context shape for commands whose SDL-host entry
 * receives cwd/env from `SdlExtensionApi` but intentionally has no stdin stream.
 */
export function createSdlCwdEnvStdinContext(ctx: SdlExtensionApi): SdlCwdEnvStdinContext {
	return {
		cwd: ctx.cwd,
		env: ctx.env,
		stdin: readEmptySdlStdin,
	};
}

export async function readEmptySdlStdin(): Promise<string> {
	return "";
}

function formatSdlConfirmationMessage(
	options: SdlClinkrInteractionOptions,
	request: ConfirmationRequest,
): string {
	return options.formatMessage?.(request) ?? request.message;
}
