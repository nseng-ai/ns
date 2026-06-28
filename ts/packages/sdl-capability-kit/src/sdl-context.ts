import type { ClinkrInteraction, ConfirmationRequest } from "@sdl/clinkr";
import type { SdlExtensionApi } from "sdl-sdk";

export interface SdlClinkrInteractionOptions {
	title: string;
	formatMessage?: ((request: ConfirmationRequest) => string) | undefined;
}

export interface SdlCwdEnvStdinContext {
	cwd: string;
	env: Record<string, string | undefined>;
	stdin(): Promise<string>;
}

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
