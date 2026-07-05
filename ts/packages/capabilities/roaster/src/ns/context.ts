import { NsCommandExecApi } from "@ns/capability-kit/command-runner";
import type { NsExtensionApi } from "@ns/kernel/sdk";

import {
	createRealRoasterContext,
	createRoasterRuntime,
	type RoasterRuntime,
} from "../core/context.ts";

export function createNsRoasterRuntime(ctx: NsExtensionApi): RoasterRuntime {
	const execApi = new NsCommandExecApi(ctx);
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
