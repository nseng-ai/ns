import { createNsGitGateway } from "@ns/capability-kit/git";
import type { NsExtensionApi } from "@ns/kernel/sdk";

import type { AretroCliContext } from "../context.ts";
import { PiJsonlSessionSource } from "../sessions/pi-jsonl-source.ts";

export function createNsAretroContext(ctx: NsExtensionApi): AretroCliContext {
	return {
		cwd: ctx.cwd,
		env: ctx.env as NodeJS.ProcessEnv,
		git: createNsGitGateway(ctx),
		sessionSource: new PiJsonlSessionSource(),
	};
}
