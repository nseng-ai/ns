import { SdlCommandExecApi } from "@ns/capability-kit/command-runner";
import type { SdlExtensionApi } from "@ns/kernel/sdk";

import {
	createRealRoasterContext,
	createRoasterRuntime,
	type RoasterRuntime,
} from "../core/context.ts";

export function createSdlRoasterRuntime(ctx: SdlExtensionApi): RoasterRuntime {
	const execApi = new SdlCommandExecApi(ctx);
	return createRoasterRuntime(
		createRealRoasterContext({
			cwd: ctx.cwd,
			env: ctx.env,
			stdin: ctx.stdin ?? (async () => ""),
			stdout: ctx.stdout ?? (() => undefined),
			stderr: ctx.stderr ?? (() => undefined),
			execApi,
		}),
	);
}
