import { createCliCommandIo, type CommandIo } from "@sdl/core/command-io";

import type { SdlExtensionApi } from "sdl-sdk";

export interface SdlExtensionCommandIoOptions {
	statusKey?: string;
	shouldSuppress?: boolean;
}

export function commandIoFromSdlExtensionApi(
	ctx: SdlExtensionApi,
	options: SdlExtensionCommandIoOptions = {},
): CommandIo {
	if (options.shouldSuppress === undefined) return createCliCommandIo(ctx);
	return createCliCommandIo(ctx, { shouldSuppress: options.shouldSuppress });
}
