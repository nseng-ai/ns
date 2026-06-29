import { SdlCommandExecApi } from "@sdl/capability-kit/command-runner";
import { RealGitGateway } from "@sdl/git";
import type { SdlExtensionApi } from "sdl-sdk";

import type { AretroCliContext } from "../context.ts";
import { PiJsonlSessionSource } from "../sessions/pi-jsonl-source.ts";

export function createSdlAretroContext(ctx: SdlExtensionApi): AretroCliContext {
	return {
		cwd: ctx.cwd,
		env: ctx.env as NodeJS.ProcessEnv,
		git: new RealGitGateway(new SdlCommandExecApi(ctx)),
		sessionSource: new PiJsonlSessionSource(),
	};
}
