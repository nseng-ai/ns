import { createCommandIo, type CommandIo } from "@sdl/core/command-io";

import type { SdlExtensionApi } from "sdl-sdk";

export interface SdlExtensionCommandIoOptions {
	statusKey?: string;
	shouldSuppress?: boolean;
}

export function commandIoFromSdlExtensionApi(
	ctx: SdlExtensionApi,
	options: SdlExtensionCommandIoOptions = {},
): CommandIo {
	return createCommandIo({
		...(ctx.onOutput === undefined
			? {}
			: { phaseTransient: (text: string) => ctx.onOutput?.("stderr", text) }),
		...(ctx.stderr === undefined ? {} : { phaseFallback: ctx.stderr }),
		...(ctx.stdout === undefined ? {} : { notifyInfo: ctx.stdout }),
		...(ctx.stderr === undefined ? {} : { notifyDiagnostic: ctx.stderr }),
		...(options.shouldSuppress === undefined ? {} : { shouldSuppress: options.shouldSuppress }),
	});
}
