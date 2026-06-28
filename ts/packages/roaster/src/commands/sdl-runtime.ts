import { SdlCommandExecApi } from "@sdl/capability-kit/command-runner";
import type { SdlExtensionApi } from "sdl-sdk";

import { createRealRoasterContext, createRoasterRuntime, type RoasterRuntime } from "../context.ts";

export function createSdlRoasterRuntime(ctx: SdlExtensionApi): RoasterRuntime {
	const execApi = new SdlCommandExecApi(ctx);
	return createRoasterRuntime(
		createRealRoasterContext({
			cwd: ctx.cwd,
			env: ctx.env,
			stdin: async () => "",
			stdout: ctx.stdout ?? (() => undefined),
			stderr: ctx.stderr ?? (() => undefined),
			execApi,
		}),
	);
}
