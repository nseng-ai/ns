import { createNsGitGateway } from "@nseng-ai/capability-kit/git";
import type { NsExtensionApi } from "@nseng-ai/kernel/sdk";

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
