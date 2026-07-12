import { createNsGitGateway } from "@nseng-ai/capability-kit";
import type { NsExtensionApi } from "@nseng-ai/sdk";

import type { RetrosCliContext } from "../context.ts";
import { PiJsonlSessionSource } from "../sessions/pi-jsonl-source.ts";

export function createNsRetrosContext(ctx: NsExtensionApi): RetrosCliContext {
	return {
		cwd: ctx.cwd,
		env: ctx.env as NodeJS.ProcessEnv,
		git: createNsGitGateway(ctx),
		sessionSource: new PiJsonlSessionSource(),
	};
}
