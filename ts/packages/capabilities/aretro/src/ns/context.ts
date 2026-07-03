import { createSdlGitGateway } from "@ns/capability-kit/git";
import type { SdlExtensionApi } from "@ns/kernel/sdk";

import type { AretroCliContext } from "../context.ts";
import { PiJsonlSessionSource } from "../sessions/pi-jsonl-source.ts";

export function createSdlAretroContext(ctx: SdlExtensionApi): AretroCliContext {
	return {
		cwd: ctx.cwd,
		env: ctx.env as NodeJS.ProcessEnv,
		git: createSdlGitGateway(ctx),
		sessionSource: new PiJsonlSessionSource(),
	};
}
