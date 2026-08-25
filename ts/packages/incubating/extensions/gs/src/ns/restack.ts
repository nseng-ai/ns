import { NsCommandExecApi } from "@nseng-ai/extension-kit/command-runner";
import type { NsExtensionApi } from "@nseng-ai/sdk";

import type { GsRestackContext } from "../core/restack/command.ts";
import { RealGsRestackGitGateway } from "../core/restack/real-git-gateway.ts";
import { RealGsRestackGateway } from "../core/restack/real-gateway.ts";

export function createRealGsRestackContext(ctx: NsExtensionApi): GsRestackContext {
	const commands = new NsCommandExecApi(ctx);
	return {
		git: new RealGsRestackGitGateway(commands, ctx.cwd),
		restack: new RealGsRestackGateway(commands, ctx.cwd),
	};
}
