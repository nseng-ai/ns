import { createCommandIo, type CommandIo } from "@sdl/core/command-io";

import type { SdlExtensionApi } from "./execution.ts";

export interface SdlExtensionCommandIoOptions {
	statusKey?: string;
	suppress?: boolean;
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
		...(options.suppress === undefined ? {} : { suppress: options.suppress }),
	});
}
